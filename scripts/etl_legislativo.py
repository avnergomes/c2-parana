#!/usr/bin/env python3
"""ETL Legislativo: ALEP projetos de lei via API de Dados Abertos - with health tracking and parallel details."""

import os
import sys
import time
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# Configuration for detail fetching
MAX_DETAIL_REQUESTS = 20  # Limit number of detail requests (out of ~30 PLs)
DETAIL_REQUEST_TIMEOUT = 30  # seconds
DETAIL_THREADS = 4  # Parallel workers for fetching details


def _request_with_retry(method: str, url: str, max_retries: int = 3, timeout: int = 30, **kwargs) -> dict | list | None:
    """HTTP request with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            resp = requests.request(method, url, timeout=timeout, headers=HEADERS, **kwargs)

            if resp.status_code == 200:
                return resp.json()

            if resp.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                print(f"  ALEP {url}: HTTP {resp.status_code}, retry {attempt+1}/{max_retries}. Waiting {wait}s...")
                time.sleep(wait)
                continue

            print(f"  ALEP {url}: HTTP {resp.status_code}")
            return None

        except requests.exceptions.ConnectionError:
            print(f"  ALEP: Connection refused, retry {attempt+1}/{max_retries}")
            time.sleep(2)
        except requests.exceptions.Timeout:
            print(f"  ALEP: Timeout, retry {attempt+1}/{max_retries}")
            time.sleep(1)
        except Exception as e:
            print(f"  ALEP: Unexpected error: {e}")
            return None

    print(f"  ALEP {url}: All {max_retries} retries failed")
    return None


def fetch_proposicoes(year: int, limit: int = 30) -> list[dict]:
    """Busca proposicoes via POST /proposicao/filtrar."""
    url = f"{ALEP_BASE}/proposicao/filtrar"
    body = {
        "ano": year,
        "numeroMaximoRegistro": limit,
    }
    data = _request_with_retry("POST", url, timeout=30, json=body)
    if data is None:
        return []
    if isinstance(data, dict):
        if not data.get("sucesso", True):
            print(f"  ALEP proposicao/filtrar: API returned sucesso=false")
            return []
        return data.get("lista", [])
    if isinstance(data, list):
        return data
    return []


def fetch_proposicao_detail(codigo: int) -> dict | None:
    """Busca detalhes de uma proposicao via GET /proposicao/{codigo}."""
    url = f"{ALEP_BASE}/proposicao/{codigo}"
    data = _request_with_retry("GET", url, timeout=DETAIL_REQUEST_TIMEOUT)
    if data is None:
        return None
    if isinstance(data, dict):
        return data.get("valor", data)
    return None


def fetch_proposicao_details_parallel(pls: list[dict], max_details: int = MAX_DETAIL_REQUESTS) -> dict:
    """Fetch details for proposicoes in parallel.

    Args:
        pls: List of proposicao dicts from fetch_proposicoes
        max_details: Maximum number of details to fetch (limits API load)

    Returns:
        Dict mapping codigo -> detail data (or None if fetch failed)
    """
    details = {}

    # Only fetch details for the first N PLs
    pls_to_fetch = pls[:max_details]

    print(f"  Fetching details for {len(pls_to_fetch)}/{len(pls)} PLs (parallel, {DETAIL_THREADS} workers)...")

    with ThreadPoolExecutor(max_workers=DETAIL_THREADS) as executor:
        # Submit all detail requests
        future_to_codigo = {}
        for pl in pls_to_fetch:
            codigo = pl.get("codigo")
            if codigo:
                future = executor.submit(fetch_proposicao_detail, codigo)
                future_to_codigo[future] = codigo

        # Collect results as they complete
        completed = 0
        for future in as_completed(future_to_codigo):
            codigo = future_to_codigo[future]
            try:
                detail = future.result()
                if detail:
                    details[codigo] = detail
            except Exception as e:
                print(f"    Error fetching detail for {codigo}: {e}")
            completed += 1
            if completed % 5 == 0:
                print(f"    {completed}/{len(pls_to_fetch)} detail requests completed")

    return details


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


def upsert_health(supabase, health_data: dict):
    """Upsert ETL health tracking to data_cache."""
    supabase.table("data_cache").upsert({
        "cache_key": "etl_health_legislativo",
        "data": health_data,
        "source": "etl_health",
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()


def main():
    start_time = datetime.now()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    items = []
    year = datetime.now().year
    api_available = False
    errors = []

    # === Verificar conectividade com API ===
    print("Checking ALEP API connectivity...")
    campos = _request_with_retry("GET", f"{ALEP_BASE}/proposicao/campos", max_retries=2, timeout=30)

    if campos is None:
        api_available = False
        print("WARNING: ALEP API (webservices.assembleia.pr.leg.br) is unavailable.")
        print("The API may be under maintenance. No legislative data will be updated in this run.")
        print("Docs: https://transparencia.assembleia.pr.leg.br/servicos/dados-abertos")
    else:
        api_available = True
        print("  ALEP API is accessible.")

        # === Projetos de lei recentes ===
        print("1/1 Fetching ALEP legislative projects...")
        try:
            pls = fetch_proposicoes(year, limit=30)
            items_found = len(pls)
            print(f"  Found: {items_found} projects")

            if pls:
                # Fetch details in parallel (limited to MAX_DETAIL_REQUESTS)
                try:
                    details_map = fetch_proposicao_details_parallel(pls, max_details=MAX_DETAIL_REQUESTS)
                    print(f"  Retrieved details for {len(details_map)} projects")
                except Exception as e:
                    print(f"  WARNING: Error fetching details in parallel: {e}")
                    errors.append(f"Parallel detail fetch: {str(e)}")
                    details_map = {}

                # Build items
                for pl in pls:
                    try:
                        codigo = pl.get("codigo")
                        detail = details_map.get(codigo) if codigo else None
                        items.append(build_proposicao_item(pl, detail, year))
                    except Exception as e:
                        print(f"  Error processing PL: {e}")
                        errors.append(f"Process PL {codigo}: {str(e)}")

        except Exception as e:
            print(f"  ERROR fetching PLs: {e}")
            errors.append(f"Fetch PLs: {str(e)}")

    # === Salvar no Supabase ===
    items_saved = 0
    if items:
        try:
            supabase.table("legislative_items").upsert(
                items,
                on_conflict="external_id"
            ).execute()
            items_saved = len(items)
            print(f"ALEP: {items_saved} items saved")
        except Exception as e:
            print(f"  Error on upsert: {e}")
            errors.append(f"Upsert: {str(e)}")
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
            items_saved = saved
            print(f"  Saved individually: {saved}/{len(items)}")
    else:
        if api_available:
            print("No legislative items found.")
            print("Possible cause: API returned empty list for current year.")

    # Calculate duration
    end_time = datetime.now()
    duration_seconds = (end_time - start_time).total_seconds()

    # Determine overall status
    overall_status = "SUCCESS" if api_available and items_saved > 0 else ("PARTIAL" if api_available else "UNAVAILABLE")

    # Health tracking
    health_data = {
        "last_run": start_time.isoformat(),
        "status": overall_status,
        "duration_seconds": round(duration_seconds, 2),
        "items_found": len(items),
        "items_saved": items_saved,
        "api_available": api_available,
        "errors": errors,
    }

    try:
        upsert_health(supabase, health_data)
    except Exception as e:
        print(f"  WARNING: Could not upsert health data: {e}")

    print("\n=== ETL Legislativo Summary ===")
    print(f"  Items found: {len(items)}")
    print(f"  Items saved: {items_saved}")
    print(f"  API available: {api_available}")
    print(f"  Duration: {duration_seconds:.1f}s")
    print(f"  Overall Status: {overall_status}")
    if errors:
        print(f"  Errors: {len(errors)}")
        for err in errors:
            print(f"    - {err}")
    print("ETL Legislativo completed!")


if __name__ == "__main__":
    main()
