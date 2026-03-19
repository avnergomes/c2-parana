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
    """Faz POST (upsert) na API PostgREST do Supabase."""
    if not records:
        return True
    upsert_headers = {**HEADERS, "Prefer": "resolution=merge-duplicates"}
    # Inserir em lotes de 200
    for i in range(0, len(records), 200):
        batch = records[i:i + 200]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
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
    """Busca dados climáticos recentes (últimas 6h) por município."""
    records = postgrest_get(
        "climate_data",
        select="municipality,ibge_code,temperature,humidity,observed_at",
        params={"order": "observed_at.desc", "limit": "500"},
    )
    # Agrupar por município (pegar o mais recente)
    by_municipality = {}
    for rec in records:
        ibge = rec.get("ibge_code")
        if not ibge or ibge in by_municipality:
            continue
        by_municipality[ibge] = {
            "temperature": rec.get("temperature"),
            "humidity": rec.get("humidity"),
        }
    print(f"  Clima: {len(by_municipality)} municípios com dados")
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
    """Busca focos de incêndio dos últimos 7 dias agrupados por município."""
    cutoff = (datetime.now() - timedelta(days=7)).date().isoformat()
    records = postgrest_get(
        "fire_spots",
        select="municipality,acq_date",
        params={"acq_date": f"gte.{cutoff}"},
    )
    # Contar focos por município (text match)
    counts = defaultdict(int)
    for rec in records:
        mun = rec.get("municipality")
        if mun:
            counts[mun] += 1
    print(f"  Focos: {sum(counts.values())} focos em {len(counts)} municípios (últimos 7 dias)")
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
    print(f"  Rios: {len(by_municipality)} municípios com dados")
    return by_municipality


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

def calc_r_clima(temperature, humidity):
    """Calcula risco climático (0-100).
    Temperatura >35°C → 50, >40°C → 100; Umidade <30% → 50; else 0.
    Média se ambos presentes.
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
    if not scores:
        return 0
    return sum(scores) / len(scores)


def calc_r_saude(alert_level):
    """Calcula risco de saúde (0-100) baseado no alert_level de dengue.
    0→0, 1→25, 2→50, 3→100
    """
    mapping = {0: 0, 1: 25, 2: 50, 3: 100}
    return mapping.get(int(alert_level or 0), 0)


def calc_r_ambiente(fire_count):
    """Calcula risco ambiental (0-100) baseado em focos de incêndio.
    0→0, 1-5→25, 6-20→50, >20→100
    """
    if fire_count <= 0:
        return 0
    if fire_count <= 5:
        return 25
    if fire_count <= 20:
        return 50
    return 100


def calc_r_hidro(alert_level):
    """Calcula risco hidrológico (0-100) baseado no alert_level do rio.
    'normal'→0, 'attention'→33, 'alert'→66, 'emergency'→100
    """
    mapping = {"normal": 0, "attention": 33, "alert": 66, "emergency": 100}
    return mapping.get(alert_level or "normal", 0)


def calc_r_ar(aqi):
    """Calcula risco de qualidade do ar (0-100) baseado no AQI.
    0-50→0, 51-100→25, 101-150→50, 151-200→75, >200→100
    """
    if aqi is None:
        return 0
    if aqi <= 50:
        return 0
    if aqi <= 100:
        return 25
    if aqi <= 150:
        return 50
    if aqi <= 200:
        return 75
    return 100


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

    print("\n5/6 Buscando níveis de rios...")
    try:
        river_data = fetch_river_levels()
    except Exception as e:
        print(f"  ERRO rios: {e}")
        river_data = {}
        errors.append(f"river_levels: {e}")

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
        # R_clima: buscar por ibge_code
        clima = climate_data.get(ibge_code, {})
        r_clima = calc_r_clima(clima.get("temperature"), clima.get("humidity"))

        # R_saude: buscar por ibge_code
        saude = dengue_data.get(ibge_code, {})
        r_saude = calc_r_saude(saude.get("alert_level", 0))

        # R_ambiente: buscar por nome do município (text match)
        fire_count = fire_data.get(mun_name, 0)
        # Também tentar match sem acento
        if fire_count == 0:
            for fire_mun, count in fire_data.items():
                matched_ibge = match_name_to_ibge(fire_mun, name_lookup)
                if matched_ibge == ibge_code:
                    fire_count = count
                    break
        r_ambiente = calc_r_ambiente(fire_count)

        # R_hidro: buscar por nome do município
        river_alert = river_data.get(mun_name, "normal")
        if river_alert == "normal":
            for river_mun, alert in river_data.items():
                matched_ibge = match_name_to_ibge(river_mun, name_lookup)
                if matched_ibge == ibge_code:
                    river_alert = alert
                    break
        r_hidro = calc_r_hidro(river_alert)

        # R_ar: buscar por cidade (mapeamento AQICN)
        r_ar_val = 0
        for city_id, city_ibge in CITY_TO_IBGE.items():
            if city_ibge == ibge_code:
                aqi = air_data.get(city_id)
                r_ar_val = calc_r_ar(aqi)
                break
        r_ar = r_ar_val

        # Calcular IRTC
        irtc = round(
            W_CLIMA * r_clima
            + W_SAUDE * r_saude
            + W_AMBIENTE * r_ambiente
            + W_HIDRO * r_hidro
            + W_AR * r_ar,
            2,
        )
        risk_level = classify_risk_level(irtc)
        risk_distribution[risk_level] += 1

        irtc_records.append({
            "ibge_code": ibge_code,
            "municipality_name": mun_name,
            "r_clima": round(r_clima, 2),
            "r_saude": round(r_saude, 2),
            "r_ambiente": round(r_ambiente, 2),
            "r_hidro": round(r_hidro, 2),
            "r_ar": round(r_ar, 2),
            "irtc_score": irtc,
            "risk_level": risk_level,
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
        print(
            f"  {i:>2}. {rec['municipality_name']:<30} "
            f"IRTC={rec['irtc_score']:>6.2f}  [{rec['risk_level']}]  "
            f"(C={rec['r_clima']:.0f} S={rec['r_saude']:.0f} A={rec['r_ambiente']:.0f} "
            f"H={rec['r_hidro']:.0f} Ar={rec['r_ar']:.0f})"
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
