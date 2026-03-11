#!/usr/bin/env python3
"""ETL Ambiente: NASA FIRMS focos de calor + ANA rios + AQICN qualidade do ar."""

import os
import io
import csv
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
NASA_FIRMS_KEY = os.environ.get("NASA_FIRMS_KEY", "DEMO_KEY")
WAQI_TOKEN = os.environ.get("WAQI_TOKEN", "demo")

# Bounding box Paraná: lon_min, lat_min, lon_max, lat_max
PR_BBOX = "-54,-26.7,-48.0,-22.5"

CIDADES_AR = [
    {"id": "curitiba", "slug": "curitiba"},
    {"id": "londrina", "slug": "londrina"},
    {"id": "maringa", "slug": "maringá"},
    {"id": "foz", "slug": "foz-do-iguaçu"},
]

# Fallback: WAQI station IDs by geo coordinates (lat, lon)
CIDADES_AR_GEO = {
    "curitiba": {"lat": -25.43, "lon": -49.27},
    "londrina": {"lat": -23.31, "lon": -51.16},
    "maringa": {"lat": -23.42, "lon": -51.94},
    "foz": {"lat": -25.52, "lon": -54.59},
}

def fetch_firms():
    """Busca focos de calor VIIRS SNPP do NASA FIRMS."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/VIIRS_SNPP_NRT/{PR_BBOX}/1"
    try:
        resp = requests.get(url, timeout=60)

        if resp.status_code in (403, 429):
            print(f"  FIRMS retornou {resp.status_code} - limite de API atingido")
            if NASA_FIRMS_KEY == "DEMO_KEY":
                print("  Configure NASA_FIRMS_KEY em GitHub Secrets!")
            return []

        resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        spots = []
        for row in reader:
            try:
                spots.append({
                    "latitude": float(row.get("latitude", 0)),
                    "longitude": float(row.get("longitude", 0)),
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
        print(f"FIRMS: {len(spots)} focos encontrados")
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
    """Tenta buscar dados WAQI por feed path. Retorna (data_dict, None) ou (None, erro_msg)."""
    url = f"https://api.waqi.info/feed/{feed_path}/?token={token}"
    resp = requests.get(url, timeout=15)
    data = resp.json()
    status = data.get("status")
    if status != "ok":
        msg = data.get("data") or data.get("message") or "unknown"
        return None, f"status={status} msg={msg}"
    return data, None


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


def fetch_ana_rivers():
    """Busca dados telemétricos de rios do PR via API SAR/ANA."""
    records = []

    for est in ESTACOES_RIOS_PR:
        try:
            now = datetime.now()
            date_end = now.strftime("%d/%m/%Y")
            date_start = (now - timedelta(days=1)).strftime("%d/%m/%Y")

            url = f"https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={est['code']}&dataInicio={date_start}&dataFim={date_end}"
            resp = requests.get(url, timeout=30)

            if resp.status_code != 200:
                print(f"  Estação {est['code']}: HTTP {resp.status_code}")
                continue

            # Parse XML
            root = ET.fromstring(resp.content)

            # Buscar dados - tentar diferentes paths
            dados = root.findall('.//DadosHidrometereologicos')
            if not dados:
                dados = root.findall('.//{http://www.ana.gov.br/}DadosHidrometereologicos')
            if not dados:
                # Tentar buscar qualquer elemento com dados
                for elem in root.iter():
                    if 'Nivel' in elem.tag or 'nivel' in elem.tag.lower():
                        nivel_val = elem.text
                        if nivel_val:
                            records.append({
                                "station_code": est["code"],
                                "station_name": est["name"],
                                "river_name": est["river"],
                                "municipality": est["municipality"],
                                "latitude": est.get("lat"),
                                "longitude": est.get("lon"),
                                "level_cm": float(nivel_val) if nivel_val.strip() else None,
                                "flow_m3s": None,
                                "alert_level": get_alert_level(est["code"], float(nivel_val) if nivel_val.strip() else None),
                                "observed_at": now.isoformat(),
                            })
                            break
                continue

            # Pegar último registro (mais recente)
            ultimo = dados[-1]

            # Tentar diferentes formatos de tag
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
                "observed_at": data_hora or now.isoformat(),
            })

        except Exception as e:
            print(f"  Erro estação {est['code']}: {e}")
            # Adicionar com dados de fallback
            records.append({
                "station_code": est["code"],
                "station_name": est["name"],
                "river_name": est["river"],
                "municipality": est["municipality"],
                "latitude": est.get("lat"),
                "longitude": est.get("lon"),
                "level_cm": None,
                "flow_m3s": None,
                "alert_level": "normal",
                "observed_at": datetime.now().isoformat(),
            })

    print(f"ANA: {len(records)} estações coletadas")
    return records

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    errors = []

    # === NASA FIRMS ===
    print("=" * 40)
    print("1/3 Buscando focos de calor NASA FIRMS...")
    try:
        if NASA_FIRMS_KEY == "DEMO_KEY":
            print("  AVISO: Usando DEMO_KEY! Configure NASA_FIRMS_KEY nos secrets do GitHub.")
            print("  Obtenha sua key em: https://firms.modaps.eosdis.nasa.gov/api/area/")

        spots = fetch_firms()
        if spots:
            try:
                supabase.table("fire_spots").upsert(
                    spots,
                    on_conflict="latitude,longitude,acq_date"
                ).execute()
                print(f"  {len(spots)} focos inseridos/atualizados")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Fallback: deletar focos recentes e inserir novos
                    cutoff = (datetime.now() - timedelta(days=1)).date().isoformat()
                    supabase.table("fire_spots").delete().gte("acq_date", cutoff).execute()
                    supabase.table("fire_spots").insert(spots).execute()
                    print(f"  {len(spots)} focos inseridos (sem upsert)")
                else:
                    raise

            # Limpar focos com mais de 30 dias
            cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
            supabase.table("fire_spots").delete().lt("acq_date", cutoff).execute()
        else:
            print("  Nenhum foco encontrado (pode ser periodo sem queimadas)")
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
        if aq_records:
            try:
                supabase.table("air_quality").upsert(
                    aq_records,
                    on_conflict="city"
                ).execute()
                print(f"  {len(aq_records)} cidades atualizadas")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Fallback: deletar e inserir
                    for rec in aq_records:
                        supabase.table("air_quality").delete().eq("city", rec["city"]).execute()
                    supabase.table("air_quality").insert(aq_records).execute()
                    print(f"  {len(aq_records)} cidades inseridas (sem upsert)")
                else:
                    raise
    except Exception as e:
        print(f"  ERRO AQICN: {e}")
        errors.append(f"AQICN: {e}")

    # === ANA Rios ===
    print("=" * 40)
    print("3/3 Buscando nivel dos rios ANA...")
    try:
        rivers = fetch_ana_rivers()
        if rivers:
            try:
                supabase.table("river_levels").upsert(
                    rivers,
                    on_conflict="station_code"
                ).execute()
                print(f"  {len(rivers)} estacoes atualizadas")
            except Exception as e:
                if "no unique or exclusion constraint" in str(e):
                    # Fallback: deletar e inserir
                    for station in ESTACOES_RIOS_PR:
                        supabase.table("river_levels").delete().eq("station_code", station["code"]).execute()
                    supabase.table("river_levels").insert(rivers).execute()
                    print(f"  {len(rivers)} estacoes inseridas (sem upsert)")
                else:
                    raise
    except Exception as e:
        print(f"  ERRO ANA: {e}")
        errors.append(f"ANA: {e}")

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
