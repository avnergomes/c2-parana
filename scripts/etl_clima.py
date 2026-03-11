#!/usr/bin/env python3
"""ETL Clima: busca dados das estações INMET do PR e salva no Supabase."""

import os
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Estações INMET no Paraná (código INMET → nome/município/IBGE)
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

def fetch_station_data(station_code: str, date_ini: str, date_fim: str) -> list:
    """Busca dados de uma estação INMET."""
    url = f"https://apitempo.inmet.gov.br/estacao/{date_ini}/{date_fim}/{station_code}"
    headers = {"User-Agent": "c2-parana/1.0 (ETL Clima)"}
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"    HTTP {response.status_code} | Content-Length: {len(response.content)} bytes")

        # INMET às vezes retorna HTML em vez de JSON (manutenção)
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' in content_type:
            print(f"    INMET retornou HTML (manutenção?) para {station_code}")
            return []

        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            print(f"    Registros retornados: {len(data)}")
            if data:
                sample = data[-1]
                print(f"    Último: DT={sample.get('DT_MEDICAO')} HR={sample.get('HR_MEDICAO')} TEM={sample.get('TEM_INS')} UMD={sample.get('UMD_INS')}")
            return data
        else:
            print(f"    Resposta não é lista: {type(data)}")
            return []
    except requests.exceptions.HTTPError as e:
        print(f"    HTTP Error estação {station_code}: {e}")
        return []
    except Exception as e:
        print(f"    Erro na estação {station_code}: {e}")
        return []

def parse_station_record(record: dict, station_code: str, meta: dict) -> dict | None:
    """Converte um registro INMET para o formato do banco."""
    try:
        # Campos INMET: TEM_INS (temp), UMD_INS (umidade), PRE_INS (pressão),
        # VEN_VEL (vento m/s), VEN_DIR (direção), CHUVA (precipitação)
        # DT_MEDICAO e HR_MEDICAO para timestamp

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
            except:
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
        print(f"  Erro ao parsear registro: {e}")
        return None

def fetch_alerts() -> list:
    """Busca alertas meteorológicos INMET."""
    url = "https://apialerta.inmet.gov.br/v4/avisos"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

        alerts = []
        for item in (data if isinstance(data, list) else []):
            # Filtrar alertas que afetam o Paraná
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
        print(f"Erro ao buscar alertas: {e}")
        return []

def main():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    now = datetime.now()
    # Usar janela de 2 dias para cobrir diferenças UTC/BRT
    date_fim = now.strftime("%Y-%m-%d")
    date_ini = (now - timedelta(days=2)).strftime("%Y-%m-%d")

    print(f"Buscando dados INMET: {date_ini} a {date_fim}")
    print(f"Timestamp atual (UTC no Actions): {now.isoformat()}")

    all_records = []
    for station_code, meta in PR_STATIONS.items():
        print(f"  Estação {station_code} — {meta['name']}")
        raw_data = fetch_station_data(station_code, date_ini, date_fim)

        for record in raw_data[-6:]:  # últimas 6 medições (ampliado de 2)
            parsed = parse_station_record(record, station_code, meta)
            if parsed:
                # Aceitar registro se tiver qualquer dado útil (não apenas temperatura)
                has_data = any([
                    parsed.get("temperature") is not None,
                    parsed.get("humidity") is not None,
                    parsed.get("wind_speed") is not None,
                    parsed.get("precipitation") is not None,
                ])
                if has_data:
                    all_records.append(parsed)

    print(f"Total de registros válidos: {len(all_records)}")
    if all_records:
        print(f"  Amostra: station={all_records[0]['station_code']} temp={all_records[0]['temperature']} at={all_records[0]['observed_at']}")
        try:
            result = supabase.table("climate_data").upsert(
                all_records,
                on_conflict="station_code,observed_at"
            ).execute()
            print(f"Inseridos/atualizados: {len(all_records)} registros de clima")
        except Exception as e:
            print(f"ERRO no upsert Supabase: {e}")
            # Tentar inserir um por um para identificar o registro problemático
            for rec in all_records[:3]:
                try:
                    supabase.table("climate_data").upsert(
                        [rec], on_conflict="station_code,observed_at"
                    ).execute()
                    print(f"    OK: {rec['station_code']} {rec['observed_at']}")
                except Exception as e2:
                    print(f"    FALHA: {rec['station_code']} -> {e2}")

        # Limpar dados com mais de 48h
        cutoff = (now - timedelta(hours=48)).isoformat()
        supabase.table("climate_data").delete().lt("observed_at", cutoff).execute()
        print("Dados antigos limpos (>48h)")
    else:
        print("Nenhum dado de clima para inserir")

    # Buscar e salvar alertas
    print("Buscando alertas INMET...")
    alerts = fetch_alerts()

    if alerts:
        # Desativar alertas antigos do INMET
        supabase.table("alerts").update({"is_active": False}).eq("source", "inmet").execute()

        result = supabase.table("alerts").upsert(
            alerts,
            on_conflict="external_id"
        ).execute()
        print(f"Alertas salvos: {len(alerts)}")
    else:
        print("Nenhum alerta INMET para o PR")

    print("ETL Clima concluído!")

if __name__ == "__main__":
    main()
