#!/usr/bin/env python3
"""ETL Clima: busca dados meteorológicos do PR e salva no Supabase.

Fonte primária: API INMET (apitempo.inmet.gov.br)
Fonte fallback: Open-Meteo (api.open-meteo.com) — gratuita, sem auth, alta disponibilidade

A API INMET é protegida por WAF (F5 BIG-IP) que frequentemente retorna HTTP 204.
Quando INMET falha, o Open-Meteo garante que dados reais sejam exibidos no dashboard.
"""

import os
import time
import requests
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Estações INMET no Paraná (código INMET → nome/município/IBGE/coordenadas)
PR_STATIONS = {
    "A807": {"name": "Curitiba", "municipality": "Curitiba", "ibge": "4106902", "lat": -25.434, "lon": -49.266},
    "A834": {"name": "Londrina", "municipality": "Londrina", "ibge": "4113700", "lat": -23.363, "lon": -51.190},
    "A820": {"name": "Maringá", "municipality": "Maringá", "ibge": "4115200", "lat": -23.403, "lon": -51.999},
    "A843": {"name": "Cascavel", "municipality": "Cascavel", "ibge": "4104808", "lat": -24.957, "lon": -53.455},
    "A847": {"name": "Foz do Iguaçu", "municipality": "Foz do Iguaçu", "ibge": "4108304", "lat": -25.535, "lon": -54.604},
    "A823": {"name": "Ponta Grossa", "municipality": "Ponta Grossa", "ibge": "4119905", "lat": -25.093, "lon": -50.166},
    "A840": {"name": "Guarapuava", "municipality": "Guarapuava", "ibge": "4109401", "lat": -25.388, "lon": -51.508},
    "A835": {"name": "Apucarana", "municipality": "Apucarana", "ibge": "4101303", "lat": -23.554, "lon": -51.437},
    "A865": {"name": "Paranaguá", "municipality": "Paranaguá", "ibge": "4118204", "lat": -25.526, "lon": -48.525},
    "A836": {"name": "Campo Mourão", "municipality": "Campo Mourão", "ibge": "4104402", "lat": -24.044, "lon": -52.393},
    "A851": {"name": "Toledo", "municipality": "Toledo", "ibge": "4127700", "lat": -24.718, "lon": -53.745},
    "A826": {"name": "Umuarama", "municipality": "Umuarama", "ibge": "4128104", "lat": -23.767, "lon": -53.330},
}

# Headers para INMET
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://tempo.inmet.gov.br",
    "Referer": "https://tempo.inmet.gov.br/",
    "Connection": "keep-alive",
}

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 10]


# ─── INMET (fonte primária) ─────────────────────────────────────────

def create_session() -> requests.Session:
    """Cria sessão HTTP com headers de navegador e warm-up de cookies."""
    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)
    try:
        print("Warm-up: obtendo cookies do WAF...")
        r = session.get("https://apitempo.inmet.gov.br/estacoes/T", timeout=15)
        cookies = session.cookies.get_dict()
        print(f"  Status: {r.status_code} | Cookies: {list(cookies.keys())}")
    except Exception as e:
        print(f"  Warm-up falhou: {e}")
    return session


def fetch_station_data_inmet(session: requests.Session, station_code: str, date_ini: str, date_fim: str) -> list:
    """Busca dados de uma estação INMET com retry."""
    url = f"https://apitempo.inmet.gov.br/estacao/{date_ini}/{date_fim}/{station_code}"

    for attempt in range(MAX_RETRIES):
        try:
            response = session.get(url, timeout=30)
            status = response.status_code
            body_len = len(response.content)
            print(f"    [INMET tentativa {attempt + 1}] HTTP {status} | {body_len} bytes")

            if status == 204 or body_len == 0:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF[attempt])
                    continue
                return []

            content_type = response.headers.get("Content-Type", "")
            if "text/html" in content_type:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF[attempt])
                    continue
                return []

            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                print(f"    INMET OK: {len(data)} registros")
                return data
            return []

        except requests.exceptions.HTTPError as e:
            print(f"    HTTP Error: {e}")
            try:
                print(f"    Body: {response.text[:300]}")
            except Exception:
                pass
            return []
        except Exception as e:
            print(f"    Erro: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF[attempt])
            else:
                return []
    return []


def parse_inmet_record(record: dict, station_code: str, meta: dict) -> dict | None:
    """Converte registro INMET para formato do banco."""
    try:
        dt_str = record.get("DT_MEDICAO", "")
        hr_str = record.get("HR_MEDICAO", "0000")
        if not dt_str:
            return None

        hr_fmt = hr_str.zfill(4)
        observed_at = f"{dt_str}T{hr_fmt[:2]}:{hr_fmt[2:]}:00-03:00"

        def safe_float(val):
            if val is None or val == "" or val == "-9999":
                return None
            try:
                return float(str(val).replace(",", "."))
            except Exception:
                return None

        return {
            "station_code": station_code,
            "station_name": meta["name"],
            "municipality": meta["municipality"],
            "ibge_code": meta["ibge"],
            "latitude": meta["lat"],
            "longitude": meta["lon"],
            "temperature": safe_float(record.get("TEM_INS")),
            "humidity": safe_float(record.get("UMD_INS")),
            "pressure": safe_float(record.get("PRE_INS")),
            "wind_speed": safe_float(record.get("VEN_VEL")),
            "wind_direction": int(safe_float(record.get("VEN_DIR")) or 0) if record.get("VEN_DIR") else None,
            "precipitation": safe_float(record.get("CHUVA")),
            "observed_at": observed_at,
        }
    except Exception as e:
        print(f"  Erro ao parsear INMET: {e}")
        return None


# ─── OPEN-METEO (fallback) ──────────────────────────────────────────

def fetch_openmeteo_current(station_code: str, meta: dict) -> list:
    """Busca dados atuais via Open-Meteo (fallback quando INMET falha)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": meta["lat"],
        "longitude": meta["lon"],
        "current": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation",
        "timezone": "America/Sao_Paulo",
    }
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        current = data.get("current", {})

        if not current:
            return []

        # Converter vento de km/h para m/s (INMET usa m/s)
        wind_kmh = current.get("wind_speed_10m")
        wind_ms = round(wind_kmh / 3.6, 1) if wind_kmh is not None else None

        observed_at = current.get("time", "")
        if observed_at and not observed_at.endswith("-03:00"):
            observed_at += ":00-03:00"

        record = {
            "station_code": station_code,
            "station_name": meta["name"],
            "municipality": meta["municipality"],
            "ibge_code": meta["ibge"],
            "latitude": meta["lat"],
            "longitude": meta["lon"],
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "pressure": current.get("surface_pressure"),
            "wind_speed": wind_ms,
            "wind_direction": int(current["wind_direction_10m"]) if current.get("wind_direction_10m") is not None else None,
            "precipitation": current.get("precipitation"),
            "observed_at": observed_at,
        }
        print(f"    Open-Meteo OK: temp={record['temperature']}°C umid={record['humidity']}%")
        return [record]
    except Exception as e:
        print(f"    Open-Meteo ERRO: {e}")
        return []


def fetch_openmeteo_hourly(station_code: str, meta: dict, days: int = 2) -> list:
    """Busca dados horários via Open-Meteo para preencher histórico."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": meta["lat"],
        "longitude": meta["lon"],
        "hourly": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation",
        "timezone": "America/Sao_Paulo",
        "past_days": days,
        "forecast_days": 0,
    }
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        hourly = data.get("hourly", {})

        times = hourly.get("time", [])
        if not times:
            return []

        records = []
        for i, t in enumerate(times):
            wind_kmh = hourly["wind_speed_10m"][i] if hourly.get("wind_speed_10m") else None
            wind_ms = round(wind_kmh / 3.6, 1) if wind_kmh is not None else None
            wind_dir = hourly["wind_direction_10m"][i] if hourly.get("wind_direction_10m") else None

            observed_at = t
            if not observed_at.endswith("-03:00"):
                observed_at += ":00-03:00"

            records.append({
                "station_code": station_code,
                "station_name": meta["name"],
                "municipality": meta["municipality"],
                "ibge_code": meta["ibge"],
                "latitude": meta["lat"],
                "longitude": meta["lon"],
                "temperature": hourly["temperature_2m"][i] if hourly.get("temperature_2m") else None,
                "humidity": hourly["relative_humidity_2m"][i] if hourly.get("relative_humidity_2m") else None,
                "pressure": hourly["surface_pressure"][i] if hourly.get("surface_pressure") else None,
                "wind_speed": wind_ms,
                "wind_direction": int(wind_dir) if wind_dir is not None else None,
                "precipitation": hourly["precipitation"][i] if hourly.get("precipitation") else None,
                "observed_at": observed_at,
            })

        # Retornar últimas 6 horas
        return records[-6:]
    except Exception as e:
        print(f"    Open-Meteo hourly ERRO: {e}")
        return []


# ─── ALERTAS ─────────────────────────────────────────────────────────

def fetch_alerts(session: requests.Session) -> list:
    """Busca alertas meteorológicos INMET."""
    url = "https://apialerta.inmet.gov.br/v4/avisos"
    for attempt in range(MAX_RETRIES):
        try:
            response = session.get(url, timeout=30)
            if response.status_code == 204 or len(response.content) == 0:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_BACKOFF[attempt])
                    continue
                return []

            response.raise_for_status()
            data = response.json()

            alerts = []
            for item in (data if isinstance(data, list) else []):
                uf = item.get("estados", [])
                if isinstance(uf, list) and "PR" not in uf:
                    continue
                if isinstance(uf, str) and "PR" not in uf:
                    continue

                severity_map = {
                    "VERMELHO": "critical",
                    "LARANJA": "high",
                    "AMARELO": "medium",
                    "VERDE": "low",
                }
                cor = item.get("cor", "").upper()
                severity = severity_map.get(cor, "info")

                alerts.append({
                    "source": "inmet",
                    "severity": severity,
                    "title": item.get("evento", "Alerta Meteorológico"),
                    "description": item.get("descricao") or item.get("endArea") or None,
                    "affected_area": item.get("geometry") or item.get("area"),
                    "affected_municipalities": None,
                    "starts_at": item.get("inicio"),
                    "ends_at": item.get("fim"),
                    "is_active": True,
                    "external_id": str(item.get("id") or item.get("idAlerta", "")),
                    "raw_data": item,
                })
            return alerts
        except Exception as e:
            print(f"  Erro alertas (tentativa {attempt + 1}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF[attempt])
            else:
                return []
    return []


# ─── MAIN ────────────────────────────────────────────────────────────

def main():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    session = create_session()

    now = datetime.now()
    date_fim = now.strftime("%Y-%m-%d")
    date_ini = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    print(f"Buscando dados: {date_ini} a {date_fim}")
    print(f"Timestamp: {now.isoformat()}")

    all_records = []
    inmet_ok = 0
    openmeteo_ok = 0
    failed = 0

    for station_code, meta in PR_STATIONS.items():
        print(f"\n  Estação {station_code} — {meta['name']}")

        # 1) Tentar INMET primeiro
        raw_data = fetch_station_data_inmet(session, station_code, date_ini, date_fim)
        station_records = []

        if raw_data:
            inmet_ok += 1
            for record in raw_data[-6:]:
                parsed = parse_inmet_record(record, station_code, meta)
                if parsed:
                    has_data = any([
                        parsed.get("temperature") is not None,
                        parsed.get("humidity") is not None,
                        parsed.get("wind_speed") is not None,
                        parsed.get("precipitation") is not None,
                    ])
                    if has_data:
                        station_records.append(parsed)

        # 2) Se INMET falhou → Open-Meteo como fallback
        if not station_records:
            print(f"    INMET sem dados, tentando Open-Meteo...")
            # Buscar dados horários (últimas horas) + current
            station_records = fetch_openmeteo_hourly(station_code, meta, days=2)
            if not station_records:
                station_records = fetch_openmeteo_current(station_code, meta)

            if station_records:
                openmeteo_ok += 1
            else:
                failed += 1

        all_records.extend(station_records)

    print(f"\n{'='*50}")
    print(f"Resumo: INMET={inmet_ok} | Open-Meteo={openmeteo_ok} | Falhas={failed}")
    print(f"Total registros válidos: {len(all_records)}")

    if all_records:
        print(f"  Amostra: {all_records[0]['station_code']} temp={all_records[0]['temperature']}°C at={all_records[0]['observed_at']}")
        try:
            result = supabase.table("climate_data").upsert(
                all_records,
                on_conflict="station_code,observed_at"
            ).execute()
            print(f"Inseridos/atualizados: {len(all_records)} registros")
        except Exception as e:
            print(f"ERRO upsert: {e}")
            for rec in all_records[:3]:
                try:
                    supabase.table("climate_data").upsert(
                        [rec], on_conflict="station_code,observed_at"
                    ).execute()
                    print(f"    OK: {rec['station_code']} {rec['observed_at']}")
                except Exception as e2:
                    print(f"    FALHA: {rec['station_code']} -> {e2}")

        # Limpar dados antigos (>48h)
        cutoff = (now - timedelta(hours=48)).isoformat()
        supabase.table("climate_data").delete().lt("observed_at", cutoff).execute()
        print("Dados antigos limpos (>48h)")
    else:
        print("ATENÇÃO: Nenhum dado obtido de nenhuma fonte!")
        print("  Verificar conectividade e status das APIs")

    # Alertas
    print("\nBuscando alertas INMET...")
    alerts = fetch_alerts(session)

    if alerts:
        new_ids = [a["external_id"] for a in alerts if a.get("external_id")]
        try:
            supabase.table("alerts").upsert(
                alerts, on_conflict="external_id"
            ).execute()
            print(f"Alertas salvos: {len(alerts)}")

            if new_ids:
                supabase.table("alerts") \
                    .update({"is_active": False}) \
                    .eq("source", "inmet") \
                    .not_.in_("external_id", new_ids) \
                    .execute()
                print(f"Alertas antigos desativados (exceto {len(new_ids)} ativos)")
        except Exception as e:
            print(f"ERRO alertas: {e}")
    else:
        print("Nenhum alerta INMET para o PR")

    print("\nETL Clima concluído!")


if __name__ == "__main__":
    main()
