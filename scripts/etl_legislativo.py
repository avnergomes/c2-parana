#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei, sessões e votações."""

import os
import requests
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

ALEP_BASE = "http://webservices.assembleia.pr.leg.br/api/public"

def fetch_alep_endpoint(path: str, params: dict = {}) -> list:
    """Busca dados de um endpoint da ALEP API."""
    url = f"{ALEP_BASE}/{path}"
    try:
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data if isinstance(data, list) else data.get("items", data.get("data", []))
    except Exception as e:
        print(f"  Erro ALEP {path}: {e}")
    return []

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    items = []
    year = datetime.now().year

    # Projetos de lei recentes
    print("Buscando projetos de lei ALEP...")
    try:
        pls = fetch_alep_endpoint("proposicoes", {"ano": year, "limit": 30, "tipo": "PL"})
        for pl in pls:
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
        print(f"Erro PLs: {e}")

    # Sessões recentes
    print("Buscando sessões ALEP...")
    try:
        sessoes = fetch_alep_endpoint("sessoes", {"limit": 10})
        for s in sessoes:
            items.append({
                "external_id": f"alep-sessao-{s.get('id') or s.get('numero')}-{year}",
                "type": "sessao",
                "number": str(s.get("numero", "")),
                "year": year,
                "title": s.get("tipo") or s.get("descricao") or "Sessão Plenária",
                "description": s.get("pauta"),
                "author": None,
                "status": s.get("situacao") or s.get("status"),
                "url": s.get("link") or "https://assembleia.pr.leg.br/plenario/sessao",
                "published_at": s.get("data") or datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"Erro sessões: {e}")

    if items:
        supabase.table("legislative_items").upsert(
            items,
            on_conflict="external_id"
        ).execute()
        print(f"ALEP: {len(items)} itens salvos")
    else:
        print("Nenhum item legislativo encontrado (API ALEP pode estar instável)")

    print("ETL Legislativo concluído!")

if __name__ == "__main__":
    main()
