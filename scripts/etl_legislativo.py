#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei via API de Dados Abertos - com retry."""

import os
import sys
import time
import requests
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# API de Dados Abertos da ALEP
# Docs: https://transparencia.assembleia.pr.leg.br/servicos/dados-abertos
# HTTPS tem problema de certificado (TLS ALT_NAME_INVALID), usar HTTP
ALEP_BASE = "http://webservices.assembleia.pr.leg.br/api/public"

HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
}


def _request_with_retry(method: str, url: str, max_retries: int = 3, **kwargs) -> dict | list | None:
    """HTTP request with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            resp = requests.request(method, url, timeout=30, headers=HEADERS, **kwargs)

            if resp.status_code == 200:
                return resp.json()

            if resp.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                print(f"  ALEP {url}: HTTP {resp.status_code}, tentativa {attempt+1}/{max_retries}. Aguardando {wait}s...")
                time.sleep(wait)
                continue

            print(f"  ALEP {url}: HTTP {resp.status_code}")
            return None

        except requests.exceptions.ConnectionError:
            print(f"  ALEP: Conexao recusada, tentativa {attempt+1}/{max_retries}")
            time.sleep(2)
        except requests.exceptions.Timeout:
            print(f"  ALEP: Timeout, tentativa {attempt+1}/{max_retries}")
            time.sleep(1)
        except Exception as e:
            print(f"  ALEP: Erro inesperado: {e}")
            return None

    print(f"  ALEP {url}: Todas as {max_retries} tentativas falharam")
    return None


def fetch_proposicoes(year: int, limit: int = 30) -> list[dict]:
    """Busca proposicoes via POST /proposicao/filtrar."""
    url = f"{ALEP_BASE}/proposicao/filtrar"
    body = {
        "ano": year,
        "numeroMaximoRegistro": limit,
    }
    data = _request_with_retry("POST", url, json=body)
    if data is None:
        return []
    if isinstance(data, dict):
        if not data.get("sucesso", True):
            print(f"  ALEP proposicao/filtrar: API retornou sucesso=false")
            return []
        return data.get("lista", [])
    if isinstance(data, list):
        return data
    return []


def fetch_proposicao_detail(codigo: int) -> dict | None:
    """Busca detalhes de uma proposicao via GET /proposicao/{codigo}."""
    url = f"{ALEP_BASE}/proposicao/{codigo}"
    data = _request_with_retry("GET", url)
    if data is None:
        return None
    if isinstance(data, dict):
        return data.get("valor", data)
    return None


def build_proposicao_item(pl: dict, detail: dict | None, year: int) -> dict:
    """Converte uma proposicao da ALEP para o formato do Supabase."""
    codigo = pl.get("codigo")
    numero = pl.get("numero", "")
    tipo = pl.get("siglaTipoProposicao") or pl.get("tipoProposicao") or "PL"

    # Usar ementa do detalhe se disponivel, senao do resumo
    ementa = None
    if detail:
        ementa = detail.get("ementa") or detail.get("assunto")
    if not ementa:
        ementa = pl.get("assunto") or pl.get("tipoProposicao") or f"{tipo} {numero}/{year}"

    autor = None
    if detail:
        autor = detail.get("autor")
    if not autor:
        autor = pl.get("autor")

    status = pl.get("status")
    if detail and not status:
        status = detail.get("status") or detail.get("situacaoProcesso")

    published_at = None
    if detail:
        published_at = detail.get("dataEntrada") or detail.get("dataRecebimento")
    if not published_at:
        published_at = datetime.now(timezone.utc).isoformat()

    portal_url = f"https://www.assembleia.pr.leg.br/pesquisa-legislativa/proposicao?idProposicao={codigo}" if codigo else f"https://www.assembleia.pr.leg.br/"

    return {
        "external_id": f"alep-pl-{codigo or numero}-{year}",
        "type": "projeto_lei",
        "number": str(numero),
        "year": year,
        "title": ementa,
        "description": detail.get("observacao") if detail else None,
        "author": autor,
        "status": status,
        "url": portal_url,
        "published_at": published_at,
    }


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    items = []
    year = datetime.now().year

    # === Verificar conectividade com API ===
    print("Verificando API ALEP...")
    campos = _request_with_retry("GET", f"{ALEP_BASE}/proposicao/campos", max_retries=2)
    if campos is None:
        print("AVISO: API da ALEP (webservices.assembleia.pr.leg.br) esta indisponivel.")
        print("A API pode estar em manutencao. Nenhum dado legislativo sera atualizado nesta execucao.")
        print("Docs: https://transparencia.assembleia.pr.leg.br/servicos/dados-abertos")
        print("ETL Legislativo concluido (sem dados novos).")
        sys.exit(0)

    print("  API ALEP acessivel.")

    # === Projetos de lei recentes ===
    print("1/1 Buscando projetos de lei ALEP...")
    try:
        pls = fetch_proposicoes(year, limit=30)
        print(f"  Encontrados: {len(pls)} projetos")

        for pl in pls:
            try:
                codigo = pl.get("codigo")
                detail = None
                if codigo:
                    detail = fetch_proposicao_detail(codigo)
                    # Rate limit: pequena pausa entre requests de detalhe
                    time.sleep(0.3)

                items.append(build_proposicao_item(pl, detail, year))
            except Exception as e:
                print(f"  Erro ao processar PL: {e}")
    except Exception as e:
        print(f"  ERRO na busca de PLs: {e}")

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
                except Exception:
                    pass
            print(f"  Salvos individualmente: {saved}/{len(items)}")
    else:
        print("Nenhum item legislativo encontrado.")
        print("Possivel causa: API retornou lista vazia para o ano corrente.")

    print("ETL Legislativo concluido!")


if __name__ == "__main__":
    main()
