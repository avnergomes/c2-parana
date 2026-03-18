#!/usr/bin/env python3
"""ETL GETEC: Agrega dados de clientes IDR-GETEC por município (sem PII)."""

import csv
import os
from collections import defaultdict
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "idr-getec-raw", "all_clients.csv")


def upsert_cache(supabase, cache_key: str, data, source: str):
    """Upsert no data_cache com timestamp atualizado."""
    if isinstance(data, list):
        data = {"items": data}

    supabase.table("data_cache").upsert(
        {
            "cache_key": cache_key,
            "data": data,
            "source": source,
            "fetched_at": datetime.now().isoformat(),
        },
        on_conflict="cache_key",
    ).execute()


def load_and_aggregate(csv_path: str):
    """Lê o CSV e agrega por município. Nenhum dado PII sai desta função."""
    municipios = defaultdict(lambda: {
        "total": 0,
        "ativos": 0,
        "inativos": 0,
        "masculino": 0,
        "feminino": 0,
    })

    total = 0
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = int(row.get("municipio_code", 0) or 0)
            nome = row.get("municipio", "").strip()
            sexo = (row.get("sexo", "") or "").strip().upper()
            situacao = (row.get("situacao", "") or "").strip().lower()

            key = (code, nome)
            municipios[key]["total"] += 1

            if situacao == "ativo":
                municipios[key]["ativos"] += 1
            else:
                municipios[key]["inativos"] += 1

            if sexo == "M":
                municipios[key]["masculino"] += 1
            elif sexo == "F":
                municipios[key]["feminino"] += 1

            total += 1

    return municipios, total


def build_kpis(municipios, total):
    """Calcula KPIs estaduais e top 15 municípios."""
    ativos = sum(m["ativos"] for m in municipios.values())
    inativos = sum(m["inativos"] for m in municipios.values())
    masculino = sum(m["masculino"] for m in municipios.values())
    feminino = sum(m["feminino"] for m in municipios.values())
    outro = total - masculino - feminino

    # Top 15 por total de clientes
    sorted_munis = sorted(
        [
            {
                "municipio_code": key[0],
                "municipio": key[1],
                "total": m["total"],
                "ativos": m["ativos"],
            }
            for key, m in municipios.items()
        ],
        key=lambda x: x["total"],
        reverse=True,
    )

    kpis = {
        "total_clientes": total,
        "clientes_ativos": ativos,
        "clientes_inativos": inativos,
        "taxa_atividade": round(ativos / total * 100, 1) if total else 0,
        "municipios_atendidos": len(municipios),
        "genero_masculino": masculino,
        "genero_feminino": feminino,
        "genero_outro": max(outro, 0),
        "top_municipios": sorted_munis[:15],
        "data_referencia": datetime.now().strftime("%Y-%m-%d"),
    }

    return kpis


def build_municipios_list(municipios):
    """Gera lista completa de municípios com métricas agregadas."""
    result = []
    for (code, nome), m in municipios.items():
        total = m["total"]
        result.append({
            "municipio_code": code,
            "municipio": nome,
            "total": total,
            "ativos": m["ativos"],
            "inativos": m["inativos"],
            "taxa_atividade": round(m["ativos"] / total * 100, 1) if total else 0,
            "masculino": m["masculino"],
            "feminino": m["feminino"],
        })
    return sorted(result, key=lambda x: x["total"], reverse=True)


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("=== ETL GETEC ===")

    # 1. Carregar e agregar
    print("1/3 Carregando all_clients.csv...")
    csv_path = os.path.normpath(CSV_PATH)
    if not os.path.exists(csv_path):
        print(f"  ERRO: Arquivo não encontrado: {csv_path}")
        return

    municipios, total = load_and_aggregate(csv_path)
    print(f"  {total:,} registros lidos, {len(municipios)} municípios")

    # 2. KPIs estaduais
    print("2/3 Calculando KPIs...")
    kpis = build_kpis(municipios, total)
    upsert_cache(supabase, "getec_kpis_pr", kpis, "idr_getec_scrape")
    print(f"  Total: {kpis['total_clientes']:,} | Ativos: {kpis['clientes_ativos']:,} | Taxa: {kpis['taxa_atividade']}%")

    # 3. Lista de municípios
    print("3/3 Salvando municípios...")
    muni_list = build_municipios_list(municipios)
    upsert_cache(supabase, "getec_municipios_pr", muni_list, "idr_getec_scrape")
    print(f"  {len(muni_list)} municípios salvos")

    print("\n=== ETL GETEC concluído! ===")


if __name__ == "__main__":
    main()
