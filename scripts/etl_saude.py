#!/usr/bin/env python3
"""ETL Saúde: InfoDengue por município PR + OpenDataSUS."""

import os
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Geocodes IBGE dos municípios do PR (os 399)
# Buscar do IBGE API para lista completa
def get_pr_municipalities():
    """Busca lista de municípios PR do IBGE."""
    url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        return [{"ibge": str(m["id"]), "name": m["nome"]} for m in data]
    except:
        # Fallback: apenas principais
        return [
            {"ibge": "4106902", "name": "Curitiba"},
            {"ibge": "4113700", "name": "Londrina"},
            {"ibge": "4115200", "name": "Maringá"},
            {"ibge": "4104808", "name": "Cascavel"},
            {"ibge": "4108304", "name": "Foz do Iguaçu"},
        ]

def fetch_dengue(ibge_code: str, weeks: int = 4) -> list:
    """Busca alertas de dengue do InfoDengue para um município."""
    url = f"https://info.dengue.mat.br/api/alertcity?geocode={ibge_code}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start=2024&ey_end=2025"
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        return []
    except:
        return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Buscando municípios PR...")
    municipios = get_pr_municipalities()
    print(f"Total: {len(municipios)} municípios")

    all_dengue = []

    for i, mun in enumerate(municipios):
        if i % 50 == 0:
            print(f"Progresso: {i}/{len(municipios)}")

        records = fetch_dengue(mun["ibge"])

        for rec in records[-4:]:  # últimas 4 semanas
            try:
                se = int(rec.get("SE", 0))
                year = int(str(se)[:4]) if se > 10000 else 2025
                week = int(str(se)[4:]) if se > 10000 else se

                all_dengue.append({
                    "ibge_code": mun["ibge"],
                    "municipality_name": mun["name"],
                    "epidemiological_week": week,
                    "year": year,
                    "cases": int(rec.get("casos", 0) or 0),
                    "cases_est": float(rec.get("casos_est", 0) or 0),
                    "alert_level": int(rec.get("nivel", 0) or 0),
                    "incidence_rate": float(rec.get("inc100k", 0) or 0),
                    "population": int(rec.get("pop", 0) or 0) or None,
                })
            except:
                continue

    if all_dengue:
        # Inserir em lotes de 100
        for i in range(0, len(all_dengue), 100):
            batch = all_dengue[i:i+100]
            supabase.table("dengue_data").upsert(
                batch,
                on_conflict="ibge_code,year,epidemiological_week"
            ).execute()
        print(f"Dengue: {len(all_dengue)} registros salvos")

    print("ETL Saúde concluído!")

if __name__ == "__main__":
    main()
