#!/usr/bin/env python3
"""ETL IRTC: Indice de Risco Territorial Composto para os 399 municipios do Parana.

Calcula o IRTC combinando dados de clima, saúde (dengue), ambiente (focos de incêndio),
hidrologia (níveis de rios) e qualidade do ar, todos já presentes no Supabase.

Fórmula:
  IRTC = 0.25*R_clima + 0.25*R_saude + 0.20*R_ambiente + 0.15*R_hidro + 0.15*R_ar

Níveis de risco:
  0-25  → baixo
  26-50 → médio
  51-75 → alto
  76-100 → crítico
"""

import os
import json
import sys
import time
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from collections import defaultdict

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# PostgREST headers (bypass RLS with service role key)
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Caminho do GeoJSON com todos os municípios PR
GEOJSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data", "municipios-pr.geojson",
)

# Pesos do IRTC
W_CLIMA = 0.25
W_SAUDE = 0.25
W_AMBIENTE = 0.20
W_HIDRO = 0.15
W_AR = 0.15


# ─── HELPERS ──────────────────────────────────────────────────────────

def postgrest_get(table, select="*", params=None):
    """Faz GET na API PostgREST do Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"  WARN: GET {table} retornou HTTP {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json()


def postgrest_upsert(table, records, on_conflict="ibge_code"):
    """Faz POST (upsert) na API PostgREST do Supabase.

    O parametro on_conflict e passado via query string (?on_conflict=<coluna>)
    porque o header Prefer=resolution=merge-duplicates sozinho so resolve
    contra a primary key. Para tabelas cuja chave logica (cache_key, ibge_code)
    e um UNIQUE constraint separado da PK, o conflict target precisa ser
    explicito. Sem ele, o PostgREST tenta INSERT puro e viola a constraint.
    """
    if not records:
        return True
    upsert_headers = {**HEADERS, "Prefer": "resolution=merge-duplicates"}
    # Inserir em lotes de 200
    for i in range(0, len(records), 200):
        batch = records[i:i + 200]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        if on_conflict:
            url += f"?on_conflict={on_conflict}"
        resp = requests.post(url, headers=upsert_headers, json=batch, timeout=30)
        if resp.status_code not in (200, 201):
            print(f"  ERRO upsert {table} lote {i}: HTTP {resp.status_code} - {resp.text[:300]}")
            return False
    return True


def load_municipalities_from_geojson():
    """Carrega lista de municípios do GeoJSON local."""
    try:
        with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
            geojson = json.load(f)
        municipalities = {}
        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            ibge_code = props.get("CD_MUN") or props.get("codarea")
            name = props.get("NM_MUN", "")
            if ibge_code and name:
                municipalities[str(ibge_code)] = name
        return municipalities
    except Exception as e:
        print(f"  ERRO ao carregar GeoJSON: {e}")
        return {}


# ─── FETCH DATA ───────────────────────────────────────────────────────

def fetch_climate_data():
    """Busca dados climaticos: valor mais recente + precipitacao acumulada 72h.

    Duas passagens na mesma tabela:
      1. Latest: ultimo temperature/humidity por municipio (para thresholds
         instantaneos de 35/40 C e 30 por cento umidade)
      2. Rolling 72h: soma de precipitation (mm/h) para detectar
         acumulados > 50mm (risco hidro) e > 100mm (risco alto de enchente)
    """
    # 1. Latest por municipio
    latest_records = postgrest_get(
        "climate_data",
        select="ibge_code,temperature,humidity,observed_at",
        params={"order": "observed_at.desc", "limit": "500"},
    )
    by_municipality: dict[str, dict] = {}
    for rec in latest_records:
        ibge = rec.get("ibge_code")
        if not ibge or ibge in by_municipality:
            continue
        by_municipality[ibge] = {
            "temperature": rec.get("temperature"),
            "humidity": rec.get("humidity"),
            "precipitation_72h": 0.0,
        }

    # 2. Precipitacao acumulada 72h por ibge
    cutoff_72h = (datetime.now() - timedelta(hours=72)).isoformat()
    precip_records = postgrest_get(
        "climate_data",
        select="ibge_code,precipitation,observed_at",
        params={
            "observed_at": f"gte.{cutoff_72h}",
            "precipitation": "not.is.null",
            "limit": "5000",
        },
    )
    precip_sum: dict[str, float] = defaultdict(float)
    for rec in precip_records:
        ibge = rec.get("ibge_code")
        p = rec.get("precipitation")
        if ibge and isinstance(p, (int, float)):
            precip_sum[ibge] += float(p)

    for ibge, total in precip_sum.items():
        if ibge not in by_municipality:
            by_municipality[ibge] = {
                "temperature": None, "humidity": None, "precipitation_72h": 0.0,
            }
        by_municipality[ibge]["precipitation_72h"] = round(total, 1)

    precip_nonzero = sum(1 for v in by_municipality.values() if v["precipitation_72h"] > 0)
    print(
        f"  Clima: {len(by_municipality)} municipios com dados "
        f"(precip 72h > 0 em {precip_nonzero})"
    )
    return by_municipality


def fetch_dengue_data():
    """Busca dados de dengue mais recentes por município."""
    records = postgrest_get(
        "dengue_data",
        select="ibge_code,alert_level,epidemiological_week,year",
        params={"order": "year.desc,epidemiological_week.desc", "limit": "1000"},
    )
    # Agrupar por município (pegar semana mais recente)
    by_municipality = {}
    for rec in records:
        ibge = rec.get("ibge_code")
        if not ibge or ibge in by_municipality:
            continue
        by_municipality[ibge] = {
            "alert_level": rec.get("alert_level", 0),
        }
    print(f"  Dengue: {len(by_municipality)} municípios com dados")
    return by_municipality


def fetch_fire_spots():
    """Busca focos de incêndio dos últimos 30 dias agrupados por município.

    Janela 30d (vs 7d anterior) porque fora do periodo de seca (set-mar)
    os focos sao esparsos e a janela curta mantinha todos os munis em zero.
    Em abril tipicamente ha ~10 focos em 7d no PR inteiro vs ~50-80 em 30d —
    isso permite que munis com queimada isolada apareçam como risco baixo
    em vez de serem diluidos.
    """
    cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
    records = postgrest_get(
        "fire_spots",
        select="municipality,acq_date",
        params={"acq_date": f"gte.{cutoff}", "limit": "5000"},
    )
    counts = defaultdict(int)
    for rec in records:
        mun = rec.get("municipality")
        if mun:
            counts[mun] += 1
    print(f"  Focos: {sum(counts.values())} focos em {len(counts)} municipios (ultimos 30 dias)")
    return counts


def fetch_river_levels():
    """Busca níveis de rios por estação, mapeando para municípios."""
    records = postgrest_get(
        "river_levels",
        select="station_code,municipality,alert_level",
    )
    # Agrupar por município (pegar pior alerta)
    alert_priority = {"normal": 0, "attention": 1, "alert": 2, "emergency": 3}
    by_municipality = {}
    for rec in records:
        mun = rec.get("municipality")
        if not mun:
            continue
        level = rec.get("alert_level", "normal")
        existing = by_municipality.get(mun, "normal")
        if alert_priority.get(level, 0) > alert_priority.get(existing, 0):
            by_municipality[mun] = level
    print(f"  Rios: {len(by_municipality)} municipios com dados")
    return by_municipality


def fetch_cemaden_hydro_scores():
    """Busca alertas CEMADEN ativos com dominio hidrologico por ibge_code.

    CEMADEN cobre 26+ cidades do PR vs 8 estacoes da ANA — complemento
    importante para risk_hidro. Apenas alertas ainda nao expirados e dos
    ultimos 3 dias sao considerados ativos.

    Mapping severidade -> score:
      observacao     -> 25
      atencao        -> 50
      alerta         -> 75
      alerta_maximo  -> 100

    Retorna dict {ibge_code: score_max} (pega o mais severo quando ha mais
    de um alerta ativo pro mesmo muni).
    """
    cutoff = (datetime.now() - timedelta(days=3)).isoformat()
    now_iso = datetime.now().isoformat()
    records = postgrest_get(
        "cemaden_alerts",
        select="ibge_code,alert_type,severity,expires_at,issued_at",
        params={
            "issued_at": f"gte.{cutoff}",
            "alert_type": "in.(hidrologico,alagamento,inundacao,enxurrada,movimento_massa)",
            "or": f"(expires_at.is.null,expires_at.gt.{now_iso})",
            "limit": "1000",
        },
    )
    severity_map = {
        "observacao": 25,
        "atencao": 50,
        "alerta": 75,
        "alerta_maximo": 100,
    }
    by_ibge: dict[str, int] = {}
    for rec in records:
        ibge = rec.get("ibge_code")
        if not ibge:
            continue
        score = severity_map.get(rec.get("severity") or "", 0)
        if score > by_ibge.get(ibge, 0):
            by_ibge[ibge] = score
    print(f"  CEMADEN hidro: {len(by_ibge)} municipios com alerta ativo")
    return by_ibge


def fetch_air_quality():
    """Busca qualidade do ar por cidade."""
    records = postgrest_get(
        "air_quality",
        select="city,aqi",
    )
    by_city = {}
    for rec in records:
        city = rec.get("city")
        aqi = rec.get("aqi")
        if city and aqi is not None:
            by_city[city] = aqi
    print(f"  Ar: {len(by_city)} cidades com dados")
    return by_city


# ─── RISK CALCULATIONS (0-100) ───────────────────────────────────────

def calc_r_clima(temperature, humidity, precipitation_72h=0.0):
    """Calcula risco climatico (0-100).

    Fontes (INMET + Open-Meteo):
      temperatura:     > 35C -> 50,  > 40C -> 100
      umidade:         < 30% -> 50
      precip 72h:      > 20mm -> 25,  > 50mm -> 60,  > 100mm -> 100

    Media dos sub-scores disponiveis.

    Returns (score, has_data): has_data is True if at least one of
    temperature, humidity, or positive precipitation was observed.
    """
    scores = []
    if temperature is not None:
        if temperature > 40:
            scores.append(100)
        elif temperature > 35:
            scores.append(50)
        else:
            scores.append(0)
    if humidity is not None:
        if humidity < 30:
            scores.append(50)
        else:
            scores.append(0)
    if precipitation_72h is not None and precipitation_72h > 0:
        if precipitation_72h > 100:
            scores.append(100)
        elif precipitation_72h > 50:
            scores.append(60)
        elif precipitation_72h > 20:
            scores.append(25)
        else:
            scores.append(0)
    if not scores:
        return (0, False)
    return (sum(scores) / len(scores), True)


def calc_r_saude(alert_level):
    """Calcula risco de saúde (0-100) baseado no alert_level do InfoDengue.

    Escala oficial do InfoDengue (https://info.dengue.mat.br):
      1 = verde   (condições nao favoraveis)         → R_saude 25
      2 = amarelo (sinais de aumento)                → R_saude 50
      3 = laranja (transmissao sustentada)           → R_saude 75
      4 = vermelho (epidemia)                        → R_saude 100

    Returns (score, has_data): has_data is True if alert_level is a valid
    InfoDengue level (1-4). Level 0 or None means no data available.
    """
    level = int(alert_level or 0)
    mapping = {1: 25, 2: 50, 3: 75, 4: 100}
    if level in mapping:
        return (mapping[level], True)
    return (0, False)


def calc_r_ambiente(fire_count):
    """Calcula risco ambiental (0-100) baseado em focos de incendio em 30d.

    Com janela 30d (vs 7d), os thresholds foram recalibrados pra refletir
    o novo volume base:
      0 focos       -> 0   (sem evidencia)
      1-3 focos     -> 15  (atividade isolada, baixo risco)
      4-15 focos    -> 40  (atividade persistente)
      16-50 focos   -> 70  (foco quente)
      >50 focos     -> 100 (area critica — provavel queimada extensa)

    Returns (score, has_data): has_data is always True for ambiente because
    FIRMS satellite coverage is global — zero fires IS a valid reading
    ("no fires detected"), not missing data.
    """
    if fire_count <= 0:
        return (0, True)
    if fire_count <= 3:
        return (15, True)
    if fire_count <= 15:
        return (40, True)
    if fire_count <= 50:
        return (70, True)
    return (100, True)


def calc_r_hidro(alert_level, has_station=False):
    """Calcula risco hidrológico (0-100) baseado no alert_level do rio.
    'normal'→0, 'attention'→33, 'alert'→66, 'emergency'→100

    Returns (score, has_data): has_data is True only if the municipality
    actually has a river gauge station. The caller must pass has_station=True
    when a real station match was found (even if status is 'normal').
    """
    mapping = {"normal": 0, "attention": 33, "alert": 66, "emergency": 100}
    score = mapping.get(alert_level or "normal", 0)
    return (score, has_station)


def calc_r_ar(aqi):
    """Calcula risco de qualidade do ar (0-100) baseado no AQI.
    0-50→0, 51-100→25, 101-150→50, 151-200→75, >200→100

    Returns (score, has_data): has_data is True if aqi is not None
    (i.e., the municipality has an AQICN station).
    """
    if aqi is None:
        return (0, False)
    if aqi <= 50:
        return (0, True)
    if aqi <= 100:
        return (25, True)
    if aqi <= 150:
        return (50, True)
    if aqi <= 200:
        return (75, True)
    return (100, True)


def classify_risk_level(irtc):
    """Classifica o nível de risco baseado no IRTC."""
    if irtc <= 25:
        return "baixo"
    if irtc <= 50:
        return "médio"
    if irtc <= 75:
        return "alto"
    return "crítico"


# ─── MUNICIPALITY NAME MATCHING ──────────────────────────────────────

def build_name_lookup(municipalities):
    """Cria lookup normalizado de nomes de municípios para IBGE codes."""
    lookup = {}
    for ibge_code, name in municipalities.items():
        # Normalizar: lowercase, sem acentos simplificado
        normalized = name.lower().strip()
        lookup[normalized] = ibge_code
        # Também mapear sem acentos comuns
        simple = (
            normalized
            .replace("á", "a").replace("ã", "a").replace("â", "a").replace("à", "a")
            .replace("é", "e").replace("ê", "e")
            .replace("í", "i").replace("î", "i")
            .replace("ó", "o").replace("ô", "o").replace("õ", "o")
            .replace("ú", "u").replace("û", "u").replace("ü", "u")
            .replace("ç", "c")
        )
        lookup[simple] = ibge_code
    return lookup


def match_name_to_ibge(name, name_lookup):
    """Tenta encontrar o IBGE code a partir de um nome de município."""
    if not name:
        return None
    normalized = name.lower().strip()
    if normalized in name_lookup:
        return name_lookup[normalized]
    # Tentar sem acentos
    simple = (
        normalized
        .replace("á", "a").replace("ã", "a").replace("â", "a").replace("à", "a")
        .replace("é", "e").replace("ê", "e")
        .replace("í", "i").replace("î", "i")
        .replace("ó", "o").replace("ô", "o").replace("õ", "o")
        .replace("ú", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c")
    )
    return name_lookup.get(simple)


# ─── CITY TO MUNICIPALITY MAPPING (air quality) ──────────────────────

# Mapeamento de IDs de cidades do AQICN para IBGE codes
CITY_TO_IBGE = {
    "curitiba": "4106902",
    "londrina": "4113700",
    "maringa": "4115200",
    "foz": "4108304",
    "cascavel": "4104808",
    "ponta-grossa": "4119905",
    "sao-jose-dos-pinhais": "4125506",
    "guarapuava": "4109401",
    "umuarama": "4128104",
    "toledo": "4127700",
    "paranagua": "4118204",
    "apucarana": "4101408",
}


# ─── MAIN ─────────────────────────────────────────────────────────────

def main():
    start_time = datetime.now()
    errors = []

    # 1. Carregar lista de municípios do GeoJSON
    print("=" * 60)
    print("ETL IRTC — Índice de Risco Territorial Composto")
    print("=" * 60)
    print("\n1/6 Carregando municípios do GeoJSON...")
    municipalities = load_municipalities_from_geojson()
    if not municipalities:
        print("ERRO FATAL: Não foi possível carregar municípios do GeoJSON")
        return
    print(f"  {len(municipalities)} municípios carregados")
    name_lookup = build_name_lookup(municipalities)

    # 2. Buscar dados de cada domínio
    print("\n2/6 Buscando dados climáticos...")
    try:
        climate_data = fetch_climate_data()
    except Exception as e:
        print(f"  ERRO clima: {e}")
        climate_data = {}
        errors.append(f"climate_data: {e}")

    print("\n3/6 Buscando dados de dengue...")
    try:
        dengue_data = fetch_dengue_data()
    except Exception as e:
        print(f"  ERRO dengue: {e}")
        dengue_data = {}
        errors.append(f"dengue_data: {e}")

    print("\n4/6 Buscando focos de incêndio...")
    try:
        fire_data = fetch_fire_spots()
    except Exception as e:
        print(f"  ERRO focos: {e}")
        fire_data = defaultdict(int)
        errors.append(f"fire_spots: {e}")

    print("\n5/6 Buscando niveis de rios + CEMADEN hidro...")
    try:
        river_data = fetch_river_levels()
    except Exception as e:
        print(f"  ERRO rios: {e}")
        river_data = {}
        errors.append(f"river_levels: {e}")
    try:
        cemaden_hydro = fetch_cemaden_hydro_scores()
    except Exception as e:
        print(f"  WARN cemaden hidro: {e}")
        cemaden_hydro = {}

    print("\n6/6 Buscando qualidade do ar...")
    try:
        air_data = fetch_air_quality()
    except Exception as e:
        print(f"  ERRO ar: {e}")
        air_data = {}
        errors.append(f"air_quality: {e}")

    # 3. Calcular IRTC para cada município
    print("\n" + "=" * 60)
    print("Calculando IRTC para cada município...")
    now = datetime.now().isoformat()
    irtc_records = []
    risk_distribution = defaultdict(int)

    for ibge_code, mun_name in municipalities.items():
        # R_clima: buscar por ibge_code (inclui precipitacao 72h acumulada)
        clima = climate_data.get(ibge_code, {})
        r_clima, r_clima_has = calc_r_clima(
            clima.get("temperature"),
            clima.get("humidity"),
            clima.get("precipitation_72h", 0.0),
        )

        # R_saude: buscar por ibge_code
        saude = dengue_data.get(ibge_code, {})
        r_saude, r_saude_has = calc_r_saude(saude.get("alert_level", 0))

        # R_ambiente: buscar por nome do município (text match)
        fire_count = fire_data.get(mun_name, 0)
        if fire_count == 0:
            for fire_mun, count in fire_data.items():
                matched_ibge = match_name_to_ibge(fire_mun, name_lookup)
                if matched_ibge == ibge_code:
                    fire_count = count
                    break
        r_ambiente, r_ambiente_has = calc_r_ambiente(fire_count)

        # R_hidro: combina ANA (rios) + CEMADEN (alertas hidrologicos).
        # Pega o maior score entre as duas fontes. CEMADEN cobre muito mais
        # municipios (~26 vs 8 da ANA) e inclui alagamento/enxurrada/inundacao.
        river_alert = river_data.get(mun_name)
        has_station = river_alert is not None
        if not has_station:
            for river_mun, alert in river_data.items():
                matched_ibge = match_name_to_ibge(river_mun, name_lookup)
                if matched_ibge == ibge_code:
                    river_alert = alert
                    has_station = True
                    break
        r_hidro_ana, _ = calc_r_hidro(river_alert or "normal", has_station=has_station)

        cemaden_score = cemaden_hydro.get(ibge_code, 0)
        cemaden_has = cemaden_score > 0

        r_hidro = max(r_hidro_ana, cemaden_score)
        r_hidro_has = has_station or cemaden_has

        # R_ar: buscar por cidade (mapeamento AQICN)
        r_ar, r_ar_has = 0, False
        for city_id, city_ibge in CITY_TO_IBGE.items():
            if city_ibge == ibge_code:
                aqi = air_data.get(city_id)
                r_ar, r_ar_has = calc_r_ar(aqi)
                break

        # Coverage-normalized IRTC (Option 4: hybrid)
        #
        # Instead of treating missing-data domains as score=0, we exclude
        # them from the weighted average. This means a municipality with
        # only dengue data (R_saude=100, epidemic) gets IRTC=100 ("critico")
        # rather than being diluted down to 25 by 4 phantom zeros.
        #
        # data_coverage = sum of weights of available domains (0..1).
        # 1.0 means all 5 domains have real data for this municipality.
        domains = [
            (W_CLIMA, r_clima, r_clima_has, "clima"),
            (W_SAUDE, r_saude, r_saude_has, "saude"),
            (W_AMBIENTE, r_ambiente, r_ambiente_has, "ambiente"),
            (W_HIDRO, r_hidro, r_hidro_has, "hidro"),
            (W_AR, r_ar, r_ar_has, "ar"),
        ]

        available = [(w, s, name) for w, s, has, name in domains if has]
        if available:
            total_weight = sum(w for w, s, n in available)
            irtc = round(sum(w * s for w, s, n in available) / total_weight, 2)
            data_coverage = round(total_weight, 2)
        else:
            irtc = 0.0
            data_coverage = 0.0

        # Secondary: max domain score and which domain dominates
        max_domain_score = 0
        dominant_domain = None
        for _w, score, has, name in domains:
            if has and score > max_domain_score:
                max_domain_score = score
                dominant_domain = name
        if dominant_domain is None and available:
            dominant_domain = available[0][2]

        risk_level = classify_risk_level(irtc)
        risk_distribution[risk_level] += 1

        irtc_records.append({
            "ibge_code": ibge_code,
            "municipality": mun_name,
            "risk_clima": round(r_clima, 2),
            "risk_saude": round(r_saude, 2),
            "risk_ambiente": round(r_ambiente, 2),
            "risk_hidro": round(r_hidro, 2),
            "risk_ar": round(r_ar, 2),
            "irtc_score": irtc,
            "risk_level": risk_level,
            "data_coverage": data_coverage,
            "max_domain_score": max_domain_score,
            "dominant_domain": dominant_domain,
            "calculated_at": now,
        })

    print(f"  {len(irtc_records)} municípios calculados")

    # 4. Upsert no Supabase
    print("\nUpsert irtc_scores no Supabase...")
    upsert_ok = postgrest_upsert("irtc_scores", irtc_records, on_conflict="ibge_code")
    if upsert_ok:
        print(f"  {len(irtc_records)} registros upserted com sucesso")
    else:
        errors.append("irtc_scores upsert falhou")
        print("  ERRO no upsert de irtc_scores")

    # 5. ETL Health tracking
    print("\nRegistrando saúde da ETL...")
    duration = (datetime.now() - start_time).total_seconds()
    status = "error" if len(errors) > 0 and not upsert_ok else (
        "partial" if len(errors) > 0 else "success"
    )

    health_record = {
        "cache_key": "etl_health_irtc",
        "data": {
            "last_run": start_time.isoformat(),
            "status": status,
            "municipalities_total": len(municipalities),
            "municipalities_calculated": len(irtc_records),
            "risk_distribution": dict(risk_distribution),
            "data_sources": {
                "climate_municipalities": len(climate_data),
                "dengue_municipalities": len(dengue_data),
                "fire_municipalities": len(fire_data),
                "river_municipalities": len(river_data),
                "air_cities": len(air_data),
            },
            "duration_seconds": round(duration, 2),
            "errors": errors,
        },
        "source": "etl_irtc",
        "fetched_at": now,
    }

    health_ok = postgrest_upsert("data_cache", [health_record], on_conflict="cache_key")
    if health_ok:
        print(f"  Health record registrado: status={status}, duration={duration:.1f}s")
    else:
        print("  AVISO: Falha ao registrar health record")

    # 6. Resumo final
    print("\n" + "=" * 60)
    print("RESUMO ETL IRTC")
    print("=" * 60)
    print(f"Total municípios: {len(municipalities)}")
    print(f"Calculados:       {len(irtc_records)}")
    print(f"Duração:          {duration:.2f}s")
    print(f"\nDistribuição de risco:")
    for level in ["baixo", "médio", "alto", "crítico"]:
        count = risk_distribution.get(level, 0)
        pct = (count / len(irtc_records) * 100) if irtc_records else 0
        bar = "█" * int(pct / 2)
        print(f"  {level:>8}: {count:>4} ({pct:5.1f}%) {bar}")

    # Top 10 por IRTC
    top10 = sorted(irtc_records, key=lambda r: r["irtc_score"], reverse=True)[:10]
    print(f"\nTop 10 municípios por IRTC:")
    for i, rec in enumerate(top10, 1):
        cov_pct = int(rec.get("data_coverage", 0) * 100)
        dom = rec.get("dominant_domain", "?")
        print(
            f"  {i:>2}. {rec['municipality']:<30} "
            f"IRTC={rec['irtc_score']:>6.2f}  [{rec['risk_level']}]  "
            f"cov={cov_pct}%  dom={dom}  "
            f"(C={rec['risk_clima']:.0f} S={rec['risk_saude']:.0f} A={rec['risk_ambiente']:.0f} "
            f"H={rec['risk_hidro']:.0f} Ar={rec['risk_ar']:.0f})"
        )

    print("=" * 60)
    if errors:
        print(f"ETL IRTC concluído com {len(errors)} erro(s):")
        for err in errors:
            print(f"  - {err}")
    else:
        print("ETL IRTC concluído com sucesso!")


if __name__ == "__main__":
    main()
