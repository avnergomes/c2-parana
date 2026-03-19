#!/usr/bin/env python3
"""ETL GETEC Extensão Rural: Scrape extensionists + projects per municipality.

Endpoints:
  - /lista/lista_ext1.php          — extensionists per municipality
  - /principal.php?content=situacao.php — extensionist overview
  - /principal.php?content=situacao_projeto.php — project overview

Requires: requests, beautifulsoup4, supabase, python-dotenv
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_URL = "http://www.idrgetec.idr.pr.gov.br"
GETEC_USER = os.environ.get("GETEC_USER", os.environ.get("IDR_GETEC_USUARIO", ""))
GETEC_PASS = os.environ.get("GETEC_PASS", os.environ.get("IDR_GETEC_SENHA", ""))

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MUNIS_PATH = PROJECT_ROOT / "data" / "idr-getec-raw" / "municipios.json"

REQUEST_DELAY = 0.2
PAGE_SIZE = 200


def upsert_cache(sb, cache_key: str, data, source: str):
    if isinstance(data, list):
        data = {"items": data}
    sb.table("data_cache").upsert({
        "cache_key": cache_key,
        "data": data,
        "source": source,
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()


def create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1.0, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Referer": f"{BASE_URL}/principal.php",
    })
    return session


def login(session: requests.Session) -> bool:
    if not GETEC_USER or not GETEC_PASS:
        print("  ERRO: Credenciais GETEC não configuradas")
        return False
    try:
        # Try both login endpoints (seglogin.php and login.php)
        for endpoint in ["seglogin.php", "login.php"]:
            resp = session.post(
                f"{BASE_URL}/{endpoint}",
                data={"usuario": GETEC_USER, "pass": GETEC_PASS,
                      "matricula": GETEC_USER, "senha": GETEC_PASS},
                timeout=15, allow_redirects=True,
            )
        # Verify login
        resp = session.get(f"{BASE_URL}/principal.php?content=cad_regcli.php", timeout=15)
        if "Cadastro" in resp.text or "principal" in resp.url:
            print(f"  Autenticado como {GETEC_USER}")
            return True
        print("  AVISO: Login pode ter falhado")
        return False
    except Exception as e:
        print(f"  Erro login: {e}")
        return False


def load_municipios() -> dict[int, str]:
    if MUNIS_PATH.exists():
        raw = json.loads(MUNIS_PATH.read_text(encoding="utf-8"))
        return {int(k): v for k, v in raw.items()}
    return {}


def extract_table_rows(html: str) -> list[list[str]]:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
        if cells and any(cells):
            rows.append(cells)
    return rows


# ─── EXTENSIONISTAS POR MUNICÍPIO ──────────────────────────────────────────


def fetch_extensionistas(session: requests.Session, municipios: dict[int, str]) -> list[dict]:
    """Fetch extensionist count and names per municipality."""
    results = []
    total = len(municipios)

    for i, (code, name) in enumerate(sorted(municipios.items())):
        if i > 0 and i % 50 == 0:
            print(f"  Progresso: {i}/{total} municípios")

        url = f"{BASE_URL}/lista/lista_ext1.php?id=,{code},{PAGE_SIZE},0"
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code != 200 or len(resp.text) < 50:
                continue

            parts = resp.text.split("@@@")
            html = parts[0]

            # Get total count
            ext_total = 0
            if len(parts) > 1:
                count_match = re.search(r'/(\d+)', parts[1].strip())
                if count_match:
                    ext_total = int(count_match.group(1))

            rows = extract_table_rows(html)
            # Skip header row
            data_rows = [r for r in rows if r and r[0] not in ("Nome", "")]

            if ext_total == 0:
                ext_total = len(data_rows)

            if ext_total > 0:
                # Extract extensionist names from first column
                nomes = [r[0] for r in data_rows if r[0] and r[0] != "Nome"]
                results.append({
                    "municipio_code": code,
                    "municipio": name,
                    "extensionistas": ext_total,
                    "nomes": nomes[:20],  # Limit to first 20 for storage
                })

        except Exception:
            continue

        time.sleep(REQUEST_DELAY)

    return results


# ─── RESUMO EXECUTIVO / MONITORAMENTO ───────────────────────────────────────


def fetch_situacao(session: requests.Session) -> dict:
    """Fetch extensionist status overview from situacao.php."""
    summary = {}
    pages = [
        ("situacao", f"{BASE_URL}/principal.php?content=situacao.php"),
        ("situacao_efetivo", f"{BASE_URL}/principal.php?content=situacao_efetivo.php"),
        ("situacao_projeto", f"{BASE_URL}/principal.php?content=situacao_projeto.php"),
    ]

    for key, url in pages:
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code != 200:
                continue

            rows = extract_table_rows(resp.text)
            if rows:
                summary[key] = rows
                print(f"  {key}: {len(rows)} linhas")
        except Exception as e:
            print(f"  Erro {key}: {e}")

    return summary


# ─── PROJETOS REFERÊNCIA ─────────────────────────────────────────────────────


def fetch_projetos(session: requests.Session) -> list[dict]:
    """Fetch project reference table."""
    url = f"{BASE_URL}/relatorios/rel_tb_pro.php?id=1"
    try:
        resp = session.get(url, timeout=30)
        if resp.status_code != 200:
            return []

        rows = extract_table_rows(resp.text)
        # Expect rows like [code, name, ...]
        projetos = []
        for row in rows:
            if len(row) >= 2 and row[0] not in ("Código", "Cod", ""):
                projetos.append({
                    "codigo": row[0],
                    "nome": row[1],
                    "detalhes": row[2] if len(row) > 2 else "",
                })
        return projetos
    except Exception as e:
        print(f"  Erro projetos: {e}")
        return []


def fetch_acoes(session: requests.Session) -> list[dict]:
    """Fetch actions reference table."""
    url = f"{BASE_URL}/relatorios/rel_tb_aca.php?id=1"
    try:
        resp = session.get(url, timeout=30)
        if resp.status_code != 200:
            return []

        rows = extract_table_rows(resp.text)
        acoes = []
        for row in rows:
            if len(row) >= 2 and row[0] not in ("Código", "Cod", ""):
                acoes.append({
                    "codigo": row[0],
                    "nome": row[1],
                })
        return acoes
    except Exception as e:
        print(f"  Erro ações: {e}")
        return []


# ─── MAIN ────────────────────────────────────────────────────────────────────


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("=== ETL GETEC Extensão Rural ===")

    session = create_session()

    # Login
    if not login(session):
        print("  FALHA: Não foi possível autenticar")
        return

    # Load municipalities
    municipios = load_municipios()
    if not municipios:
        print("  ERRO: municipios.json não encontrado. Rode scrape_idr_getec.py primeiro.")
        return
    print(f"  {len(municipios)} municípios carregados")

    # 1. Extensionistas per municipality
    print("\n1/4 Buscando extensionistas por município...")
    extensionistas = fetch_extensionistas(session, municipios)
    extensionistas.sort(key=lambda x: x["extensionistas"], reverse=True)
    total_ext = sum(e["extensionistas"] for e in extensionistas)
    munis_com_ext = len(extensionistas)
    print(f"  {total_ext} extensionistas em {munis_com_ext} municípios")

    # 2. Projetos reference
    print("\n2/4 Buscando tabela de projetos...")
    projetos = fetch_projetos(session)
    print(f"  {len(projetos)} projetos")

    # 3. Ações reference
    print("\n3/4 Buscando tabela de ações...")
    acoes = fetch_acoes(session)
    print(f"  {len(acoes)} ações")

    # 4. Situação/monitoramento
    print("\n4/4 Buscando resumo executivo...")
    situacao = fetch_situacao(session)

    # Build aggregated payload
    extensao_data = {
        "kpis": {
            "total_extensionistas": total_ext,
            "municipios_com_extensionista": munis_com_ext,
            "municipios_sem_extensionista": len(municipios) - munis_com_ext,
            "media_por_municipio": round(total_ext / munis_com_ext, 1) if munis_com_ext else 0,
            "total_projetos": len(projetos),
            "total_acoes": len(acoes),
            "data_referencia": datetime.now().strftime("%Y-%m-%d"),
        },
        "extensionistas_por_municipio": extensionistas,
        "projetos": projetos[:50],  # Limit for storage
        "acoes": acoes[:50],
        "situacao": situacao,
    }

    # Save to Supabase
    print("\nSalvando dados...")
    upsert_cache(sb, "getec_extensao_pr", extensao_data, "idr_getec_extensao")

    # Summary
    print(f"\n=== Resumo ===")
    print(f"  Extensionistas: {total_ext}")
    print(f"  Municípios com extensionista: {munis_com_ext}/{len(municipios)}")
    print(f"  Projetos: {len(projetos)}")
    print(f"  Ações: {len(acoes)}")
    print("ETL GETEC Extensão Rural concluído!")


if __name__ == "__main__":
    main()
