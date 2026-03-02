#!/usr/bin/env python3
"""ETL Saude: InfoDengue por municipio PR - versao otimizada."""

import os
import time
import requests
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

CURRENT_YEAR = datetime.now().year

# =====================================================
# ESTRATEGIA: Dois tiers de municipios
# Tier 1 (50 maiores): ~80% da populacao PR -> rodar SEMPRE
# Tier 2 (349 restantes): rodar semanal via FULL_RUN=true
# =====================================================

# Top 50 municipios PR por populacao (cobrindo ~80% da pop do estado)
TIER1_MUNICIPIOS = [
    {"ibge": "4106902", "name": "Curitiba"},
    {"ibge": "4113700", "name": "Londrina"},
    {"ibge": "4115200", "name": "Maringa"},
    {"ibge": "4119905", "name": "Ponta Grossa"},
    {"ibge": "4104808", "name": "Cascavel"},
    {"ibge": "4108304", "name": "Foz do Iguacu"},
    {"ibge": "4105508", "name": "Colombo"},
    {"ibge": "4109401", "name": "Guarapuava"},
    {"ibge": "4118204", "name": "Paranagua"},
    {"ibge": "4101804", "name": "Araucaria"},
    {"ibge": "4127700", "name": "Toledo"},
    {"ibge": "4101307", "name": "Apucarana"},
    {"ibge": "4119152", "name": "Pinhais"},
    {"ibge": "4104402", "name": "Campo Mourao"},
    {"ibge": "4128104", "name": "Umuarama"},
    {"ibge": "4118601", "name": "Paranavai"},
    {"ibge": "4107652", "name": "Fazenda Rio Grande"},
    {"ibge": "4100400", "name": "Almirante Tamandare"},
    {"ibge": "4103404", "name": "Cambe"},
    {"ibge": "4125506", "name": "Sao Jose dos Pinhais"},
    {"ibge": "4103602", "name": "Campo Largo"},
    {"ibge": "4120200", "name": "Rolandia"},
    {"ibge": "4106571", "name": "Cianorte"},
    {"ibge": "4107207", "name": "Cornelio Procopio"},
    {"ibge": "4110706", "name": "Irati"},
    {"ibge": "4128302", "name": "Uniao da Vitoria"},
    {"ibge": "4113601", "name": "Lapa"},
    {"ibge": "4115804", "name": "Medianeira"},
    {"ibge": "4117602", "name": "Palmas"},
    {"ibge": "4108957", "name": "Goioere"},
    {"ibge": "4116208", "name": "Marechal Candido Rondon"},
    {"ibge": "4112504", "name": "Jaguariaiva"},
    {"ibge": "4114302", "name": "Mandaguari"},
    {"ibge": "4126256", "name": "Sarandi"},
    {"ibge": "4102802", "name": "Bandeirantes"},
    {"ibge": "4107538", "name": "Dois Vizinhos"},
    {"ibge": "4108403", "name": "Francisco Beltrao"},
    {"ibge": "4117206", "name": "Ortigueira"},
    {"ibge": "4117271", "name": "Paicandu"},
    {"ibge": "4118402", "name": "Pato Branco"},
    {"ibge": "4118707", "name": "Pinhao"},
    {"ibge": "4119103", "name": "Pitanga"},
    {"ibge": "4120606", "name": "Santa Fe"},
    {"ibge": "4126306", "name": "Santo Antonio da Platina"},
    {"ibge": "4127106", "name": "Telemaco Borba"},
    {"ibge": "4128500", "name": "Wenceslau Braz"},
    {"ibge": "4105805", "name": "Corbelia"},
    {"ibge": "4121208", "name": "Santa Helena"},
    {"ibge": "4101002", "name": "Ampere"},
    {"ibge": "4114609", "name": "Marialva"},
]


def get_full_pr_municipalities():
    """Busca lista completa de municipios PR do IBGE."""
    url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios"
    try:
        resp = requests.get(url, timeout=30)
        data = resp.json()
        return [{"ibge": str(m["id"]), "name": m["nome"]} for m in data]
    except Exception as e:
        print(f"  Erro ao buscar municipios IBGE: {e}")
        return []


def fetch_dengue_batch(municipios: list, label: str) -> list:
    """Busca dados de dengue para uma lista de municipios com rate limiting."""
    all_dengue = []
    erros = 0
    max_erros = 10  # Para se tiver mais de 10 erros consecutivos

    for i, mun in enumerate(municipios):
        if i % 25 == 0:
            print(f"  [{label}] Progresso: {i}/{len(municipios)} | Erros: {erros}")

        url = f"https://info.dengue.mat.br/api/alertcity?geocode={mun['ibge']}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start={CURRENT_YEAR - 1}&ey_end={CURRENT_YEAR}"

        try:
            resp = requests.get(url, timeout=15)  # Timeout menor: 15s em vez de 30s

            if resp.status_code == 429:
                print(f"  Rate limited! Esperando 10s...")
                time.sleep(10)
                resp = requests.get(url, timeout=15)  # Retry

            if resp.status_code != 200:
                erros += 1
                continue

            records = resp.json()

            for rec in records[-4:]:  # ultimas 4 semanas
                try:
                    se = int(rec.get("SE", 0))
                    year = int(str(se)[:4]) if se > 10000 else CURRENT_YEAR
                    week = int(str(se)[4:]) if se > 10000 else se

                    # Limitar alert_level a 4 (constraint do banco)
                    alert_level = min(int(rec.get("nivel", 0) or 0), 4)

                    all_dengue.append({
                        "ibge_code": mun["ibge"],
                        "municipality_name": mun["name"],
                        "epidemiological_week": week,
                        "year": year,
                        "cases": int(rec.get("casos", 0) or 0),
                        "cases_est": float(rec.get("casos_est", 0) or 0),
                        "alert_level": alert_level,
                        "incidence_rate": float(rec.get("inc100k", 0) or 0),
                        "population": int(rec.get("pop", 0) or 0) or None,
                    })
                except:
                    continue

            erros = 0  # Reset erro counter em sucesso

        except requests.exceptions.Timeout:
            erros += 1
            print(f"  Timeout em {mun['name']} ({mun['ibge']})")
        except Exception as e:
            erros += 1

        # Rate limiting: 100ms entre requests para nao sobrecarregar InfoDengue
        time.sleep(0.1)

        # Circuit breaker: se muitos erros seguidos, parar
        if erros >= max_erros:
            print(f"  {max_erros} erros consecutivos. Parando batch {label}.")
            break

    return all_dengue


def upsert_dengue(supabase, records: list):
    """Insere dados de dengue no Supabase em lotes."""
    if not records:
        return

    # Inserir em lotes de 200 (mais eficiente que 100)
    for i in range(0, len(records), 200):
        batch = records[i:i+200]
        try:
            supabase.table("dengue_data").upsert(
                batch,
                on_conflict="ibge_code,year,epidemiological_week"
            ).execute()
        except Exception as e:
            print(f"  Erro upsert lote {i}: {e}")
            # Tentar inserir um por um
            for rec in batch:
                try:
                    supabase.table("dengue_data").upsert(
                        [rec],
                        on_conflict="ibge_code,year,epidemiological_week"
                    ).execute()
                except:
                    pass


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Verificar se deve rodar modo completo
    is_full_run = os.environ.get("FULL_RUN", "false").lower() == "true"

    if is_full_run:
        print("=== MODO COMPLETO: Todos os 399 municipios ===")
        municipios_full = get_full_pr_municipalities()
        if municipios_full:
            municipios = municipios_full
        else:
            print("Falha ao buscar lista completa, usando Tier 1")
            municipios = TIER1_MUNICIPIOS
    else:
        print("=== MODO RAPIDO: Top 50 municipios (Tier 1) ===")
        municipios = TIER1_MUNICIPIOS

    print(f"Total: {len(municipios)} municipios")

    records = fetch_dengue_batch(municipios, "main")

    if records:
        upsert_dengue(supabase, records)
        print(f"Dengue: {len(records)} registros salvos")
    else:
        print("Nenhum registro de dengue obtido")

    print("ETL Saude concluido!")


if __name__ == "__main__":
    main()
