#!/usr/bin/env python3
"""ETL Ambiente: NASA FIRMS focos de calor + ANA rios + AQICN qualidade do ar."""

import os
import io
import csv
import requests
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
    {"id": "maringa", "slug": "maringa"},
    {"id": "foz", "slug": "foz-do-iguacu"},
]

def fetch_firms():
    """Busca focos de calor VIIRS SNPP do NASA FIRMS."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/VIIRS_SNPP_NRT/{PR_BBOX}/1"
    try:
        resp = requests.get(url, timeout=60)
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

def fetch_aqicn():
    """Busca qualidade do ar AQICN para cidades PR."""
    records = []
    for city in CIDADES_AR:
        url = f"https://api.waqi.info/feed/{city['slug']}/?token={WAQI_TOKEN}"
        try:
            resp = requests.get(url, timeout=15)
            data = resp.json()

            if data.get("status") != "ok":
                continue

            d = data["data"]
            iaqi = d.get("iaqi", {})

            records.append({
                "city": city["id"],
                "station_name": d.get("city", {}).get("name"),
                "aqi": int(d.get("aqi", 0)) if d.get("aqi") != "-" else None,
                "dominant_pollutant": d.get("dominentpol"),
                "pm25": float(iaqi.get("pm25", {}).get("v", 0)) if iaqi.get("pm25") else None,
                "pm10": float(iaqi.get("pm10", {}).get("v", 0)) if iaqi.get("pm10") else None,
                "o3": float(iaqi.get("o3", {}).get("v", 0)) if iaqi.get("o3") else None,
                "no2": float(iaqi.get("no2", {}).get("v", 0)) if iaqi.get("no2") else None,
                "co": float(iaqi.get("co", {}).get("v", 0)) if iaqi.get("co") else None,
                "observed_at": d.get("time", {}).get("iso") or datetime.now().isoformat(),
            })
        except Exception as e:
            print(f"  Erro AQICN {city['id']}: {e}")

    print(f"AQICN: {len(records)} cidades coletadas")
    return records

def fetch_ana_rivers():
    """Busca estações e nível de rios ANA para o PR."""
    url = "https://www.ana.gov.br/ANA_Telemetrica/api/estacoes?codEstado=41"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()

        estacoes = data if isinstance(data, list) else data.get("items", [])
        records = []

        for est in estacoes[:50]:  # Limitar para não sobrecarregar
            try:
                records.append({
                    "station_code": str(est.get("codEstacao") or est.get("codigo", "")),
                    "station_name": est.get("nomeEstacao") or est.get("nome", ""),
                    "river_name": est.get("nomeRio") or est.get("rio"),
                    "municipality": est.get("municipio"),
                    "ibge_code": str(est.get("codMunicipio") or "") or None,
                    "latitude": float(est.get("latitude", 0)) if est.get("latitude") else None,
                    "longitude": float(est.get("longitude", 0)) if est.get("longitude") else None,
                    "level_cm": float(est.get("cota") or est.get("nivel_cm", 0)) if est.get("cota") or est.get("nivel_cm") else None,
                    "flow_m3s": None,
                    "alert_level": "normal",
                    "observed_at": est.get("dataMedicao") or datetime.now().isoformat(),
                })
            except:
                continue

        print(f"ANA: {len(records)} estações coletadas")
        return records
    except Exception as e:
        print(f"Erro ANA: {e}")
        return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # NASA FIRMS
    print("Buscando focos de calor NASA FIRMS...")
    spots = fetch_firms()
    if spots:
        supabase.table("fire_spots").upsert(spots).execute()
        # Limpar focos com mais de 30 dias
        cutoff = (datetime.now() - timedelta(days=30)).date().isoformat()
        supabase.table("fire_spots").delete().lt("acq_date", cutoff).execute()

    # AQICN
    print("Buscando qualidade do ar AQICN...")
    aq_records = fetch_aqicn()
    if aq_records:
        supabase.table("air_quality").insert(aq_records).execute()
        # Limpar dados com mais de 7 dias
        cutoff = (datetime.now() - timedelta(days=7)).isoformat()
        supabase.table("air_quality").delete().lt("observed_at", cutoff).execute()

    # ANA
    print("Buscando nível dos rios ANA...")
    rivers = fetch_ana_rivers()
    if rivers:
        supabase.table("river_levels").upsert(
            rivers,
            on_conflict="station_code"
        ).execute()

    print("ETL Ambiente concluído!")

if __name__ == "__main__":
    main()
