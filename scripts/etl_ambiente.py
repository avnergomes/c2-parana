#!/usr/bin/env python3
"""ETL Ambiente: NASA FIRMS focos de calor + ANA rios + AQICN qualidade do ar.

Foco -> municipio por ponto-no-poligono (scripts/pr_geo.py, mesma regra de
supabase/functions/_shared/pr_geo.ts): grava municipality e ibge_code e
descarta foco fora do PR. Focos antigos sem ibge_code sao reclassificados a
cada execucao (_backfill_fire_spots). Estacao da ANA sem leitura valida nao
e gravada: a ultima leitura real fica com a sua data.
"""

import os
import io
import re
import csv
import json
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

from pr_geo import municipio_do_ponto

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NASA_FIRMS_KEY = os.environ.get("NASA_FIRMS_KEY", "DEMO_KEY")
WAQI_TOKEN = os.environ.get("WAQI_TOKEN", "demo")

# Bounding box Paraná: lon_min, lat_min, lon_max, lat_max. O PR vai de
# -54,62 a -48,02 de longitude e de -26,72 a -22,52 de latitude; ate 2026-10
# o bbox comecava em -54 e 11 municipios do extremo Oeste ficavam de fora.
PR_BBOX = "-54.7,-26.8,-47.9,-22.4"

CIDADES_AR = [
    {"id": "curitiba", "slug": "curitiba"},
    {"id": "londrina", "slug": "londrina"},
    {"id": "maringa", "slug": "maringá"},
    {"id": "foz", "slug": "foz-do-iguaçu"},
    {"id": "cascavel", "slug": "cascavel"},
    {"id": "ponta-grossa", "slug": "ponta-grossa"},
    {"id": "sao-jose-dos-pinhais", "slug": "são-josé-dos-pinhais"},
    {"id": "guarapuava", "slug": "guarapuava"},
    {"id": "umuarama", "slug": "umuarama"},
    {"id": "toledo", "slug": "toledo"},
    {"id": "paranagua", "slug": "paranaguá"},
    {"id": "apucarana", "slug": "apucarana"},
]

# Fallback: WAQI station IDs by geo coordinates (lat, lon).
# O AQICN tambem expoe /feed/geo:LAT;LON — quando o slug-based nao encontra
# estacao, o fallback tenta achar uma estacao dentro de ~100km da cidade.
CIDADES_AR_GEO = {
    "curitiba": {"lat": -25.43, "lon": -49.27},
    "londrina": {"lat": -23.31, "lon": -51.16},
    "maringa": {"lat": -23.42, "lon": -51.94},
    "foz": {"lat": -25.52, "lon": -54.59},
    "cascavel": {"lat": -24.9545, "lon": -53.4596},
    "ponta-grossa": {"lat": -25.0959, "lon": -50.1647},
    "sao-jose-dos-pinhais": {"lat": -25.5307, "lon": -49.2000},
    "guarapuava": {"lat": -25.3890, "lon": -51.4638},
    "umuarama": {"lat": -23.7652, "lon": -53.3248},
    "toledo": {"lat": -24.7257, "lon": -53.7406},
    "paranagua": {"lat": -25.5169, "lon": -48.7296},
    "apucarana": {"lat": -23.5707, "lon": -51.4635},
}

def request_with_retry(url, method='GET', max_retries=3, timeout=30, **kwargs):
    """
    Faz requisição HTTP com retry exponencial.

    Args:
        url: URL a requisitar
        method: 'GET' ou 'POST'
        max_retries: máximo de tentativas
        timeout: timeout em segundos
        **kwargs: argumentos adicionais para requests (json, data, headers, etc)

    Returns:
        Response object se bem-sucedido, None se falhar após retries
    """
    base_delay = 1  # segundo inicial
    for attempt in range(max_retries):
        try:
            if method.upper() == 'GET':
                resp = requests.get(url, timeout=timeout, **kwargs)
            elif method.upper() == 'POST':
                resp = requests.post(url, timeout=timeout, **kwargs)
            else:
                raise ValueError(f"Método HTTP não suportado: {method}")

            # Sucesso
            if resp.status_code < 500:
                return resp

            # Erro 5xx - pode fazer retry
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"    HTTP {resp.status_code}, retry em {delay}s (tentativa {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue
            else:
                print(f"    HTTP {resp.status_code} após {max_retries} tentativas")
                return resp

        except (requests.Timeout, requests.ConnectionError) as e:
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"    Timeout/conexão, retry em {delay}s: {e}")
                time.sleep(delay)
                continue
            else:
                print(f"    Falha de conexão após {max_retries} tentativas: {e}")
                return None
        except Exception as e:
            print(f"    Erro inesperado: {e}")
            return None

    return None

def fetch_firms():
    """Busca focos de calor VIIRS SNPP do NASA FIRMS com retry.

    Janela de 5 dias (maximo permitido pela API FIRMS VIIRS_SNPP_NRT,
    verificado: status 400 "Invalid day range. Expects [1..5]" para valores
    acima). Com a janela anterior de 1 dia, qualquer run perdido deixava
    um buraco definitivo em fire_spots. Com cron 12h x5 dias = 10 runs
    de cobertura; gaps so se mais de 4 dias de cron falham seguidos.
    UNIQUE constraint deduplica re-inserts.
    """
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/VIIRS_SNPP_NRT/{PR_BBOX}/5"
    try:
        resp = request_with_retry(url, method='GET', max_retries=3, timeout=60)

        if resp is None:
            print(f"  Falha ao conectar FIRMS após retries")
            return []

        if resp.status_code in (403, 429):
            print(f"  FIRMS retornou {resp.status_code} - limite de API atingido")
            if NASA_FIRMS_KEY == "DEMO_KEY":
                print("  Configure NASA_FIRMS_KEY em GitHub Secrets!")
            return []

        resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        spots = []
        fora_do_pr = 0
        for row in reader:
            try:
                lat = float(row.get("latitude", 0))
                lon = float(row.get("longitude", 0))
                municipio = municipio_do_ponto(lat, lon)
                if municipio is None:
                    fora_do_pr += 1
                    continue
                spots.append({
                    "latitude": lat,
                    "longitude": lon,
                    "municipality": municipio["nome"],
                    "ibge_code": municipio["ibge"],
                    "brightness": float(row.get("bright_ti4", 0)) if row.get("bright_ti4") else None,
                    "scan": float(row.get("scan", 0)) if row.get("scan") else None,
                    "track": float(row.get("track", 0)) if row.get("track") else None,
                    "acq_date": row.get("acq_date", datetime.now().date().isoformat()),
                    "acq_time": row.get("acq_time"),
                    "satellite": row.get("satellite"),
                    "instrument": "VIIRS",
                    "confidence": row.get("confidence"),
                })
            except:
                continue
        print(f"FIRMS: {len(spots)} focos no PR ({fora_do_pr} fora do PR descartados)")
        return spots
    except Exception as e:
        print(f"Erro FIRMS: {e}")
        return []

def _parse_aqicn_data(city_id, data):
    """Extrai registro de qualidade do ar a partir da resposta WAQI."""
    d = data["data"]
    iaqi = d.get("iaqi", {})
    return {
        "city": city_id,
        "station_name": d.get("city", {}).get("name"),
        "aqi": int(d.get("aqi", 0)) if d.get("aqi") != "-" else None,
        "dominant_pollutant": d.get("dominentpol"),
        "pm25": float(iaqi.get("pm25", {}).get("v", 0)) if iaqi.get("pm25") else None,
        "pm10": float(iaqi.get("pm10", {}).get("v", 0)) if iaqi.get("pm10") else None,
        "o3": float(iaqi.get("o3", {}).get("v", 0)) if iaqi.get("o3") else None,
        "no2": float(iaqi.get("no2", {}).get("v", 0)) if iaqi.get("no2") else None,
        "co": float(iaqi.get("co", {}).get("v", 0)) if iaqi.get("co") else None,
        "observed_at": d.get("time", {}).get("iso") or datetime.now().isoformat(),
    }


def _try_aqicn_feed(feed_path, token):
    """Tenta buscar dados WAQI por feed path com retry. Retorna (data_dict, None) ou (None, erro_msg)."""
    url = f"https://api.waqi.info/feed/{feed_path}/?token={token}"
    resp = request_with_retry(url, method='GET', max_retries=3, timeout=15)
    if resp is None:
        return None, "Falha de conexão após retries"
    try:
        data = resp.json()
        status = data.get("status")
        if status != "ok":
            msg = data.get("data") or data.get("message") or "unknown"
            return None, f"status={status} msg={msg}"
        return data, None
    except Exception as e:
        return None, f"Erro ao parsear JSON: {e}"


def fetch_aqicn():
    """Busca qualidade do ar AQICN para cidades PR."""
    records = []
    for city in CIDADES_AR:
        city_id = city["id"]
        slug = city["slug"]
        try:
            # Tentativa 1: busca por nome da cidade
            data, err = _try_aqicn_feed(slug, WAQI_TOKEN)
            if data is None:
                print(f"  AQICN {city_id}: feed/{slug} falhou ({err}), tentando geo...")
                # Tentativa 2: busca por coordenada geográfica
                geo = CIDADES_AR_GEO.get(city_id)
                if geo:
                    geo_path = f"geo:{geo['lat']};{geo['lon']}"
                    data, err2 = _try_aqicn_feed(geo_path, WAQI_TOKEN)
                    if data is None:
                        print(f"  AQICN {city_id}: feed/{geo_path} também falhou ({err2}), pulando")
                        continue
                    print(f"  AQICN {city_id}: sucesso via geo fallback")
                else:
                    print(f"  AQICN {city_id}: sem coordenadas de fallback, pulando")
                    continue

            records.append(_parse_aqicn_data(city_id, data))
            print(f"  AQICN {city_id}: AQI={records[-1].get('aqi')}")
        except Exception as e:
            print(f"  Erro AQICN {city_id}: {e}")

    print(f"AQICN: {len(records)} cidades coletadas")
    return records

# Estações fluviométricas principais do PR
ESTACOES_RIOS_PR = [
    {"code": "65017006", "name": "Porto Amazonas", "river": "Rio Iguaçu", "municipality": "Porto Amazonas", "lat": -25.55, "lon": -49.88},
    {"code": "65310000", "name": "União da Vitória", "river": "Rio Iguaçu", "municipality": "União da Vitória", "lat": -26.23, "lon": -51.08},
    {"code": "64507000", "name": "Porto São José", "river": "Rio Paraná", "municipality": "São Pedro do Paraná", "lat": -22.76, "lon": -53.17},
    {"code": "64620000", "name": "Salto Caxias", "river": "Rio Iguaçu", "municipality": "Capitão Leônidas Marques", "lat": -25.54, "lon": -53.50},
    {"code": "65035000", "name": "São José dos Pinhais", "river": "Rio Iguaçu", "municipality": "São José dos Pinhais", "lat": -25.53, "lon": -49.20},
    {"code": "64693000", "name": "Foz do Iguaçu", "river": "Rio Iguaçu", "municipality": "Foz do Iguaçu", "lat": -25.59, "lon": -54.58},
    {"code": "65155000", "name": "São Mateus do Sul", "river": "Rio Iguaçu", "municipality": "São Mateus do Sul", "lat": -25.87, "lon": -50.38},
    {"code": "64475000", "name": "Tibagi", "river": "Rio Tibagi", "municipality": "Tibagi", "lat": -24.51, "lon": -50.41},
]

# Cotas de alerta por estação (em cm)
COTAS_ALERTA = {
    "65017006": {"attention": 300, "alert": 450, "emergency": 600},
    "65310000": {"attention": 500, "alert": 700, "emergency": 900},
    "64507000": {"attention": 400, "alert": 600, "emergency": 800},
    "64620000": {"attention": 450, "alert": 650, "emergency": 850},
    "65035000": {"attention": 250, "alert": 400, "emergency": 550},
    "64693000": {"attention": 350, "alert": 500, "emergency": 700},
    "65155000": {"attention": 400, "alert": 600, "emergency": 800},
    "64475000": {"attention": 300, "alert": 500, "emergency": 700},
}


def get_alert_level(station_code: str, level_cm: float) -> str:
    """Calcula nível de alerta baseado na cota."""
    if level_cm is None:
        return "normal"
    cotas = COTAS_ALERTA.get(station_code, {"attention": 200, "alert": 400, "emergency": 600})
    if level_cm >= cotas["emergency"]:
        return "emergency"
    elif level_cm >= cotas["alert"]:
        return "alert"
    elif level_cm >= cotas["attention"]:
        return "attention"
    return "normal"


def _parse_ana_xml_robust(xml_content):
    """
    Parse XML ANA de forma robusta, tratando diferentes namespaces e formatos.
    Retorna (dados_list, None) se sucesso ou (None, erro_msg) se falha.
    """
    try:
        # Verificar se é realmente XML
        if not xml_content.strip().startswith(b'<'):
            # Provavelmente HTML de erro
            return None, "Resposta não é XML (provavelmente HTML de erro)"

        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        return None, f"XML malformado: {e}"
    except Exception as e:
        return None, f"Erro ao fazer parse XML: {e}"

    # Tentar diferentes patterns de namespace
    namespace_patterns = [
        './/DadosHidrometereologicos',  # Sem namespace
        './/{http://www.ana.gov.br/}DadosHidrometereologicos',  # Com namespace
    ]

    dados = None
    for pattern in namespace_patterns:
        dados = root.findall(pattern)
        if dados:
            break

    if not dados:
        # Fallback: procurar qualquer elemento com "Dados" no nome
        for elem in root.iter():
            if 'Dados' in elem.tag:
                # Tentar usar este elemento
                dados = [elem]
                break

    if not dados:
        return None, "Nenhum elemento de dados encontrado no XML"

    return dados, None


def data_hora_ana_iso(data_hora):
    """Data/hora da ANA vem em horario de Brasilia e sem fuso; gravada assim
    num timestamptz virava UTC e a leitura parecia 3 h mais velha. ISO sem
    fuso ganha -03:00; qualquer outro formato passa como veio."""
    if not data_hora:
        return None
    t = data_hora.strip()
    if not t:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$", t):
        return t.replace(" ", "T") + "-03:00"
    return t


def fetch_ana_rivers():
    """Busca dados telemétricos de rios do PR via API SAR/ANA com retry e parsing robusto."""
    records = []

    for est in ESTACOES_RIOS_PR:
        try:
            now = datetime.now()
            date_end = now.strftime("%d/%m/%Y")
            date_start = (now - timedelta(days=1)).strftime("%d/%m/%Y")

            url = f"https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={est['code']}&dataInicio={date_start}&dataFim={date_end}"
            resp = request_with_retry(url, method='GET', max_retries=3, timeout=30)

            if resp is None:
                print(f"  Estação {est['code']}: Falha de conexão após retries (mantida a ultima leitura)")
                continue

            if resp.status_code != 200:
                print(f"  Estação {est['code']}: HTTP {resp.status_code} (mantida a ultima leitura)")
                continue

            # Parse XML robusto
            dados, err = _parse_ana_xml_robust(resp.content)
            if dados is None:
                print(f"  Estação {est['code']}: Parse XML falhou - {err} (mantida a ultima leitura)")
                continue

            # Pegar último registro (mais recente)
            if not dados:
                print(f"  Estação {est['code']}: Nenhum dado disponível (mantida a ultima leitura)")
                continue

            ultimo = dados[-1]

            # Tentar diferentes formatos de tag (com/sem namespace)
            nivel = None
            vazao = None
            data_hora = None

            for child in ultimo:
                tag_lower = child.tag.lower().split('}')[-1]
                if 'nivel' in tag_lower:
                    nivel = child.text
                elif 'vazao' in tag_lower:
                    vazao = child.text
                elif 'datahora' in tag_lower or 'data' in tag_lower:
                    data_hora = child.text

            level_cm = float(nivel) if nivel and nivel.strip() else None
            flow_m3s = float(vazao) if vazao and vazao.strip() else None
            observed_at = data_hora_ana_iso(data_hora)
            if level_cm is None or observed_at is None:
                print(f"  Estação {est['code']}: leitura sem nivel ou sem data (mantida a ultima leitura)")
                continue

            records.append({
                "station_code": est["code"],
                "station_name": est["name"],
                "river_name": est["river"],
                "municipality": est["municipality"],
                "latitude": est.get("lat"),
                "longitude": est.get("lon"),
                "level_cm": level_cm,
                "flow_m3s": flow_m3s,
                "alert_level": get_alert_level(est["code"], level_cm),
                "observed_at": observed_at,
            })

        except Exception as e:
            print(f"  Erro estação {est['code']}: {e} (mantida a ultima leitura)")

    print(f"ANA: {len(records)} estações coletadas")
    return records

def _insert_fire_spots_dedupe(supabase, records):
    """Insert fire_spots um a um com dedup defensivo.

    O UNIQUE INDEX em fire_spots usa COALESCE(acq_time, '') em expressao,
    o que o PostgREST on_conflict nao consegue referenciar. Antes o script
    tentava upsert, caia em constraint error, e usava fallback delete+insert
    que apagava focos dos ultimos 1-dia (causando perda permanente do
    historico quando a janela FIRMS nao cobria os dias deletados).

    Solucao sem depender de migration: insert um a um, e em caso de
    duplicate key (UNIQUE existente), simplesmente ignoramos. Preserva
    historico sem apagar nada.
    """
    inserted = 0
    skipped = 0
    errors = 0
    for rec in records:
        try:
            supabase.table("fire_spots").insert(rec).execute()
            inserted += 1
        except Exception as e:
            msg = str(e).lower()
            if "duplicate key" in msg or "23505" in msg:
                skipped += 1
            else:
                errors += 1
    return inserted, skipped, errors


def _backfill_fire_spots(supabase):
    """Reclassifica focos gravados sem ibge_code (anteriores ao ponto-no-poligono):
    dentro do PR ganham municipality/ibge_code; fora do PR sao apagados. Cada
    linha tratada sai do filtro, entao o laco termina; o teto de paginas so
    limita a duracao."""
    atualizados = apagados = erros = 0
    for _pagina in range(10):
        try:
            linhas = (
                supabase.table("fire_spots")
                .select("id,latitude,longitude,acq_date")
                .is_("ibge_code", "null")
                .limit(1000)
                .execute()
                .data
                or []
            )
        except Exception as e:
            print(f"  Aviso backfill fire_spots: {e}")
            erros += 1
            break
        if not linhas:
            break
        atualizar, apagar = [], []
        for l in linhas:
            mun = municipio_do_ponto(l["latitude"], l["longitude"])
            if mun is None:
                apagar.append(l["id"])
            else:
                atualizar.append({**l, "municipality": mun["nome"], "ibge_code": mun["ibge"]})
        for i in range(0, len(atualizar), 200):
            try:
                supabase.table("fire_spots").upsert(atualizar[i:i + 200], on_conflict="id").execute()
                atualizados += len(atualizar[i:i + 200])
            except Exception as e:
                print(f"  Aviso backfill upsert: {e}")
                erros += 1
        for i in range(0, len(apagar), 100):
            try:
                supabase.table("fire_spots").delete().in_("id", apagar[i:i + 100]).execute()
                apagados += len(apagar[i:i + 100])
            except Exception as e:
                print(f"  Aviso backfill delete: {e}")
                erros += 1
        if erros:
            break
    return atualizados, apagados, erros


def _try_upsert_with_fallback(supabase, table_name, records, conflict_field):
    """
    Tenta upsert, e se falhar com constraint error, faz delete+insert.
    NAO usado mais para fire_spots (ver _insert_fire_spots_dedupe).
    """
    try:
        supabase.table(table_name).upsert(
            records,
            on_conflict=conflict_field
        ).execute()
        return True, None
    except Exception as e:
        error_str = str(e)
        if "no unique or exclusion constraint" in error_str or "constraint" in error_str.lower():
            try:
                if table_name == "air_quality":
                    for rec in records:
                        supabase.table(table_name).delete().eq("city", rec["city"]).execute()
                elif table_name == "river_levels":
                    for rec in records:
                        supabase.table(table_name).delete().eq("station_code", rec["station_code"]).execute()

                supabase.table(table_name).insert(records).execute()
                return True, "upsert_fallback"
            except Exception as e2:
                return False, f"Delete+insert falhou: {e2}"
        else:
            return False, str(e)


def main():
    start_time = datetime.now()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    errors = []
    firms_count = 0
    aqicn_count = 0
    ana_count = 0

    # === NASA FIRMS ===
    print("=" * 40)
    print("1/3 Buscando focos de calor NASA FIRMS...")
    try:
        if NASA_FIRMS_KEY == "DEMO_KEY":
            print("  AVISO: Usando DEMO_KEY! Configure NASA_FIRMS_KEY nos secrets do GitHub.")
            print("  Obtenha sua key em: https://firms.modaps.eosdis.nasa.gov/api/area/")

        spots = fetch_firms()
        firms_count = len(spots)
        if spots:
            inserted, skipped, err_count = _insert_fire_spots_dedupe(supabase, spots)
            print(f"  FIRMS: {inserted} inseridos, {skipped} ja existiam (dedup), {err_count} erros")
            if err_count > 0:
                errors.append(f"FIRMS insert: {err_count} records falharam")

            # Limpar focos com mais de 30 dias
            try:
                cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
                supabase.table("fire_spots").delete().lt("acq_date", cutoff).execute()
            except Exception as e:
                print(f"  Aviso ao limpar focos antigos: {e}")
        else:
            print("  Nenhum foco encontrado (pode ser periodo sem queimadas)")
        atualizados, apagados, err_bf = _backfill_fire_spots(supabase)
        print(f"  Backfill: {atualizados} focos antigos reclassificados, {apagados} fora do PR apagados")
        if err_bf:
            errors.append(f"FIRMS backfill: {err_bf} erro(s)")
    except Exception as e:
        print(f"  ERRO FIRMS: {e}")
        errors.append(f"FIRMS: {e}")

    # === AQICN ===
    print("=" * 40)
    print("2/3 Buscando qualidade do ar AQICN...")
    try:
        if WAQI_TOKEN == "demo":
            print("  AVISO: Usando token demo! Configure WAQI_TOKEN nos secrets do GitHub.")
            print("  Obtenha seu token em: https://aqicn.org/data-platform/token/")

        aq_records = fetch_aqicn()
        aqicn_count = len(aq_records)
        if aq_records:
            success, msg = _try_upsert_with_fallback(supabase, "air_quality", aq_records, "city")
            if success:
                print(f"  {len(aq_records)} cidades atualizadas {f'({msg})' if msg else ''}")
            else:
                print(f"  ERRO ao atualizar qualidade do ar: {msg}")
                errors.append(f"AQICN insert: {msg}")
    except Exception as e:
        print(f"  ERRO AQICN: {e}")
        errors.append(f"AQICN: {e}")

    # === ANA Rios ===
    print("=" * 40)
    print("3/3 Buscando nivel dos rios ANA...")
    try:
        rivers = fetch_ana_rivers()
        ana_count = len(rivers)
        if rivers:
            success, msg = _try_upsert_with_fallback(supabase, "river_levels", rivers, "station_code")
            if success:
                print(f"  {len(rivers)} estacoes atualizadas {f'({msg})' if msg else ''}")
            else:
                print(f"  ERRO ao atualizar níveis dos rios: {msg}")
                errors.append(f"ANA insert: {msg}")
    except Exception as e:
        print(f"  ERRO ANA: {e}")
        errors.append(f"ANA: {e}")

    # === ETL Health Tracking ===
    print("=" * 40)
    print("Registrando saúde da ETL...")
    try:
        duration = (datetime.now() - start_time).total_seconds()
        status = "error" if len(errors) > 0 else "success"
        if len(errors) > 0 and (firms_count > 0 or aqicn_count > 0 or ana_count > 0):
            status = "partial"

        # Schema (migration 001_initial_schema.sql): data_cache columns are
        # cache_key, data (JSONB), source, fetched_at, expires_at, metadata.
        # Prior code sent key/value/updated_at which do not exist, producing
        # silent PGRST204 errors on every run.
        health_record = {
            "cache_key": "etl_health_ambiente",
            "data": {
                "last_run": start_time.isoformat(),
                "status": status,
                "firms_spots": firms_count,
                "aqicn_cities": aqicn_count,
                "ana_stations": ana_count,
                "duration_seconds": duration,
                "errors": errors,
            },
            "source": "etl_ambiente",
            "fetched_at": datetime.now().isoformat(),
        }

        # Tentar upsert
        try:
            supabase.table("data_cache").upsert(
                health_record,
                on_conflict="cache_key"
            ).execute()
        except Exception as e:
            if "no unique or exclusion constraint" in str(e):
                # Fallback: deletar antigo e inserir novo
                supabase.table("data_cache").delete().eq("cache_key", "etl_health_ambiente").execute()
                supabase.table("data_cache").insert(health_record).execute()
            else:
                raise

        print(f"  Health record registrado: status={status}, duration={duration:.1f}s")
    except Exception as e:
        print(f"  Aviso ao registrar health: {e}")

    # === Resumo ===
    print("=" * 40)
    if errors:
        print(f"ETL Ambiente concluido com {len(errors)} erro(s):")
        for err in errors:
            print(f"  - {err}")
        # NAO sair com exit code 1 - dados parciais sao melhores que nenhum dado
    else:
        print("ETL Ambiente concluido com sucesso!")

if __name__ == "__main__":
    main()
