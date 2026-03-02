#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei, sessoes e votacoes - com retry."""

import os
import time
import requests
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Tentar HTTPS primeiro, fallback para HTTP
ALEP_BASES = [
    "https://webservices.assembleia.pr.leg.br/api/public",
    "http://webservices.assembleia.pr.leg.br/api/public",
]


def fetch_alep_endpoint(path: str, params: dict = {}, max_retries: int = 3) -> list:
    """Busca dados de um endpoint da ALEP API com retry."""

    for base in ALEP_BASES:
        url = f"{base}/{path}"

        for attempt in range(max_retries):
            try:
                resp = requests.get(url, params=params, timeout=30,
                                    headers={"Accept": "application/json"})

                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        return data
                    # Tentar extrair de diferentes formatos de resposta
                    if isinstance(data, dict):
                        return data.get("items", data.get("data", data.get("results", [])))
                    return []

                if resp.status_code in (500, 502, 503, 504):
                    wait = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    print(f"  ALEP {path}: HTTP {resp.status_code}, tentativa {attempt+1}/{max_retries}. Aguardando {wait}s...")
                    time.sleep(wait)
                    continue

                # 404 ou outro erro -> nao retry
                print(f"  ALEP {path}: HTTP {resp.status_code}")
                return []

            except requests.exceptions.ConnectionError as e:
                print(f"  ALEP {path}: Conexao recusada ({base}), tentativa {attempt+1}/{max_retries}")
                time.sleep(2)
            except requests.exceptions.Timeout:
                print(f"  ALEP {path}: Timeout, tentativa {attempt+1}/{max_retries}")
                time.sleep(1)
            except Exception as e:
                print(f"  ALEP {path}: Erro inesperado: {e}")
                return []

    print(f"  ALEP {path}: Todas as tentativas falharam")
    return []


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    items = []
    year = datetime.now().year

    # === Projetos de lei recentes ===
    print("1/2 Buscando projetos de lei ALEP...")
    try:
        pls = fetch_alep_endpoint("proposicoes", {"ano": year, "limit": 30, "tipo": "PL"})
        print(f"  Encontrados: {len(pls)} projetos")

        for pl in pls:
            try:
                items.append({
                    "external_id": f"alep-pl-{pl.get('id') or pl.get('numero')}-{year}",
                    "type": "projeto_lei",
                    "number": str(pl.get("numero", "")),
                    "year": year,
                    "title": pl.get("ementa") or pl.get("titulo") or f"PL {pl.get('numero')}/{year}",
                    "description": pl.get("descricao"),
                    "author": pl.get("autor") or pl.get("autores"),
                    "status": pl.get("situacao") or pl.get("status"),
                    "url": pl.get("link") or pl.get("url") or f"https://assembleia.pr.leg.br/busca?q=PL+{pl.get('numero')}",
                    "published_at": pl.get("dataApresentacao") or pl.get("data") or datetime.now(timezone.utc).isoformat(),
                })
            except Exception as e:
                print(f"  Erro ao processar PL: {e}")
    except Exception as e:
        print(f"  ERRO na busca de PLs: {e}")

    # === Sessoes recentes ===
    print("2/2 Buscando sessoes ALEP...")
    try:
        sessoes = fetch_alep_endpoint("sessoes", {"limit": 10})
        print(f"  Encontradas: {len(sessoes)} sessoes")

        for s in sessoes:
            try:
                items.append({
                    "external_id": f"alep-sessao-{s.get('id') or s.get('numero')}-{year}",
                    "type": "sessao",
                    "number": str(s.get("numero", "")),
                    "year": year,
                    "title": s.get("tipo") or s.get("descricao") or "Sessao Plenaria",
                    "description": s.get("pauta"),
                    "author": None,
                    "status": s.get("situacao") or s.get("status"),
                    "url": s.get("link") or "https://assembleia.pr.leg.br/plenario/sessao",
                    "published_at": s.get("data") or datetime.now(timezone.utc).isoformat(),
                })
            except Exception as e:
                print(f"  Erro ao processar sessao: {e}")
    except Exception as e:
        print(f"  ERRO na busca de sessoes: {e}")

    # === Salvar no Supabase ===
    if items:
        try:
            supabase.table("legislative_items").upsert(
                items,
                on_conflict="external_id"
            ).execute()
            print(f"ALEP: {len(items)} itens salvos")
        except Exception as e:
            print(f"  Erro no upsert: {e}")
            # Tentar um por um
            saved = 0
            for item in items:
                try:
                    supabase.table("legislative_items").upsert(
                        [item], on_conflict="external_id"
                    ).execute()
                    saved += 1
                except:
                    pass
            print(f"  Salvos individualmente: {saved}/{len(items)}")
    else:
        print("Nenhum item legislativo encontrado (API ALEP pode estar instavel)")
        # NAO sair com exit code 1 - a API simplesmente pode estar fora

    print("ETL Legislativo concluido!")


if __name__ == "__main__":
    main()
