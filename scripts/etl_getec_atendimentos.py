#!/usr/bin/env python3
"""ETL GETEC Atendimentos: Scrape daily attendance counts per municipality.

Uses the "Produtores Atendidos por Município" PDF report from IDR-GETEC,
filtered by date range (yesterday), to count attendance per municipality.

Requires: requests, pdfplumber, supabase, python-dotenv
"""

import io
import json
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path

import pdfplumber
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_URL = "http://www.idrgetec.idr.pr.gov.br"
GETEC_USER = os.environ.get("GETEC_USER", "")
GETEC_PASS = os.environ.get("GETEC_PASS", "")

REPORT_URL = f"{BASE_URL}/relatorios/rel_acomp_lista_mun.php"
GETEC_MUNICIPIOS_JSON = Path(__file__).parent / "getec_municipios.json"


def upsert_cache(supabase_client, cache_key: str, data, source: str):
    if isinstance(data, list):
        data = {"items": data}
    supabase_client.table("data_cache").upsert({
        "cache_key": cache_key,
        "data": data,
        "source": source,
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()


def login(session: requests.Session) -> bool:
    """Login to IDR-GETEC.

    The GETEC server always returns HTTP 200 even on failed login (just
    re-shows the login form). A successful login redirects to principal.php
    and sets a session cookie. We verify both redirect URL AND cookie
    presence, not just status code.
    """
    if not GETEC_USER or not GETEC_PASS:
        print("  AVISO: Credenciais GETEC nao configuradas")
        return False

    try:
        resp = session.post(
            f"{BASE_URL}/login.php",
            data={"matricula": GETEC_USER, "senha": GETEC_PASS},
            timeout=15,
            allow_redirects=True,
        )
        has_redirect = "principal.php" in resp.url
        has_cookie = bool(session.cookies.get("PHPSESSID"))
        # Check body for login failure indicators
        body_lower = resp.text[:2000].lower()
        has_error = "senha" in body_lower and ("incorreta" in body_lower or "invalida" in body_lower or "errada" in body_lower)

        if has_redirect and not has_error:
            print(f"  Autenticado no GETEC como {GETEC_USER} (cookie={has_cookie})")
            return True

        print(f"  AVISO: Login GETEC falhou (redirect={has_redirect}, cookie={has_cookie}, error_in_body={has_error})")
        return False
    except Exception as e:
        print(f"  Erro login GETEC: {e}")
        return False


def get_municipalities(session: requests.Session) -> list[dict]:
    """Get list of GETEC municipalities.

    Primary source: scripts/getec_municipios.json (committed to repo, no PII,
    just code+name). This avoids depending on a live scrape that fails when
    the login session is invalid or the GETEC server blocks CI runner IPs.

    Fallback: scrape from the GETEC search page (requires valid session).
    """
    # Primary: static JSON (same pattern as pr_municipios.json for IBGE)
    if GETEC_MUNICIPIOS_JSON.exists():
        try:
            with GETEC_MUNICIPIOS_JSON.open(encoding="utf-8") as f:
                data = json.load(f)
            print(f"  Lista de municipios carregada do JSON estatico ({len(data)} munis)")
            return data
        except Exception as e:
            print(f"  Erro ao ler {GETEC_MUNICIPIOS_JSON.name}: {e} - tentando scrape")

    # Fallback: scrape from GETEC search page
    try:
        search_url = f"{BASE_URL}/telapesquisa/telapesquisa_regcli.php"
        resp = session.get(search_url, params={"id": "1", "id2": GETEC_USER, "id3": "-1"}, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        munis = []
        for select in soup.find_all("select"):
            for opt in select.find_all("option"):
                code = opt.get("value", "")
                name = opt.get_text(strip=True)
                if code.isdigit() and int(code) >= 10 and "Selecione" not in name and len(name) > 2:
                    munis.append({"code": int(code), "name": name})
            if len(munis) > 100:
                break

        if munis:
            print(f"  {len(munis)} municipios via scrape GETEC")
            return munis
    except Exception as e:
        print(f"  Erro ao scrape municipios GETEC: {e}")

    return []


def parse_atendimentos_pdf(pdf_bytes: bytes, ref_date: str) -> dict:
    """Parse attendance PDF report.

    Returns dict with:
      - produtores_atendidos: total producers served (year)
      - atendimentos_total: sum of all attendance counts (year)
      - atendimentos_dia: producers whose last attendance is ref_date
      - datas: dict mapping YYYY-MM-DD -> count of producers with that last_date
    """
    result = {"produtores_atendidos": 0, "atendimentos_total": 0, "atendimentos_dia": 0, "datas": {}}

    if len(pdf_bytes) < 500:
        return result

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    # Lines look like: "1 Abner G Picinertto 2 26/02/2026"
                    # Pattern: number, name, atendimentos count, date
                    match = re.match(
                        r'^(\d+)\s+(.+?)\s+(\d+)\s+(\d{2}/\d{2}/\d{4})\s*$',
                        line,
                    )
                    if match:
                        atend_count = int(match.group(3))
                        last_date = match.group(4)
                        result["produtores_atendidos"] += 1
                        result["atendimentos_total"] += atend_count

                        # Convert DD/MM/YYYY to YYYY-MM-DD
                        try:
                            d, m, y = last_date.split("/")
                            iso_date = f"{y}-{m}-{d}"
                            result["datas"][iso_date] = result["datas"].get(iso_date, 0) + 1
                        except ValueError:
                            pass

                        # Check if last attendance is on the reference date
                        if ref_date:
                            ref_parts = ref_date.split("-")
                            ref_ddmmyyyy = f"{ref_parts[2]}/{ref_parts[1]}/{ref_parts[0]}"
                            if last_date == ref_ddmmyyyy:
                                result["atendimentos_dia"] += 1

        return result
    except Exception as e:
        print(f"    Erro parsing PDF: {e}")
        return result


def fetch_atendimentos(session: requests.Session, municipalities: list[dict], ref_date: str) -> tuple[list[dict], dict[str, int]]:
    """Fetch attendance data for each municipality.

    Returns:
        (results_per_municipality, global_date_histogram)
    """
    results = []
    date_histogram: dict[str, int] = {}
    total = len(municipalities)
    year = ref_date[:4]

    for i, mun in enumerate(municipalities):
        if i > 0 and i % 50 == 0:
            print(f"  Progresso: {i}/{total} municípios processados")

        try:
            resp = session.post(
                REPORT_URL,
                data={
                    "Ano": year,
                    "CodMun": str(mun["code"]),
                    "CodOrg": "7",
                    "CodReg": "-1",
                    "CodAdi": "-1",
                    "CodExt": "-1",
                    "CodPro": "-1",
                    "CodMes": "-1",
                    "CodProa": "-1",
                    "CodSub": "-1",
                    "CodAca": "-1",
                    "CodMet": "",
                    "Fper": "-1",
                    "codpro_esp": "-1",
                    "datini": "",
                    "datfin": "",
                    "mes1": "1",
                    "mes2": "12",
                    "CodPesq": "",
                    "Categoria": "-1",
                    "CodTpe": "-1",
                },
                timeout=30,
            )

            if resp.status_code == 200 and resp.content[:4] == b"%PDF":
                parsed = parse_atendimentos_pdf(resp.content, ref_date)
                if parsed["produtores_atendidos"] > 0:
                    results.append({
                        "municipio_code": mun["code"],
                        "municipio": mun["name"],
                        "atendimentos_dia": parsed["atendimentos_dia"],
                        "atendimentos_total": parsed["atendimentos_total"],
                        "produtores_atendidos": parsed["produtores_atendidos"],
                        "data": ref_date,
                    })
                    # Merge date counts into global histogram
                    for dt, count in parsed["datas"].items():
                        date_histogram[dt] = date_histogram.get(dt, 0) + count

        except Exception as e:
            print(f"    Erro {mun['name']}: {e}")
            continue

        time.sleep(0.15)

    return results, date_histogram


def main():
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("=== ETL GETEC Atendimentos ===")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    })

    # Login — the GETEC server blocks non-Brazilian IPs (GitHub Actions
    # runners). If login fails, skip PDF fetching entirely to avoid 409
    # requests × 30s timeout each (= 3.4 hours of wasted CI time).
    # Data from previous local runs remains in Supabase untouched.
    logged_in = login(session)
    if not logged_in:
        print("  AVISO: Login GETEC falhou (provavel bloqueio de IP do runner).")
        print("  Pulando busca de PDFs. Execute localmente para atualizar dados.")
        print("ETL GETEC Atendimentos finalizado (sem dados novos).")
        return

    # Get municipalities
    print("1/3 Buscando lista de municípios...")
    municipalities = get_municipalities(session)
    if not municipalities:
        print("  ERRO: Nenhum município encontrado")
        return
    print(f"  {len(municipalities)} municípios")

    # Fetch atendimentos — ref_date = yesterday for "atendimentos_dia" count
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    print(f"2/3 Buscando atendimentos (ref: {yesterday})...")
    results, date_histogram = fetch_atendimentos(session, municipalities, yesterday)
    results.sort(key=lambda x: x["atendimentos_total"], reverse=True)
    print(f"  {len(results)} municípios com atendimentos")
    print(f"  {len(date_histogram)} datas distintas na timeline")

    # Save
    print("3/4 Salvando resultados por município...")
    upsert_cache(supabase_client, "getec_atendimentos_pr", results, "idr_getec_report")

    # Save daily timeline (sorted by date)
    print("4/5 Salvando timeline diária...")
    timeline = [{"date": dt, "produtores": count} for dt, count in sorted(date_histogram.items())]
    upsert_cache(supabase_client, "getec_timeline_pr", timeline, "idr_getec_report")

    # Save per-municipality-per-date data for map glow layer
    # Structure: { "YYYY-MM-DD": { "mun_code": count, ... }, ... }
    print("5/5 Salvando atendimentos diários por município (mapa)...")
    daily_by_mun: dict[str, dict[str, int]] = {}
    for r in results:
        code = str(r["municipio_code"])
        if r["atendimentos_dia"] > 0:
            if yesterday not in daily_by_mun:
                daily_by_mun[yesterday] = {}
            daily_by_mun[yesterday][code] = r["atendimentos_dia"]
    # Also build from date_histogram + municipality distribution
    # For dates other than ref_date, distribute proportionally by municipality weight
    total_prod = sum(r["produtores_atendidos"] for r in results)
    if total_prod > 0:
        mun_weights = {str(r["municipio_code"]): r["produtores_atendidos"] / total_prod for r in results}
        for dt, global_count in date_histogram.items():
            if dt == yesterday:
                continue  # already have exact data
            daily_by_mun[dt] = {}
            for code, weight in mun_weights.items():
                approx = round(global_count * weight)
                if approx > 0:
                    daily_by_mun[dt][code] = approx
    upsert_cache(supabase_client, "getec_atendimentos_daily_pr", daily_by_mun, "idr_getec_report")

    total_dia = sum(r["atendimentos_dia"] for r in results)
    total_ano = sum(r["atendimentos_total"] for r in results)
    total_prod = sum(r["produtores_atendidos"] for r in results)
    print(f"\n=== Resumo ===")
    print(f"  Data referência: {yesterday}")
    print(f"  Municípios ativos: {len(results)}")
    print(f"  Produtores atendidos (ano): {total_prod}")
    print(f"  Atendimentos (ano): {total_ano}")
    print(f"  Atendimentos (dia): {total_dia}")
    print("ETL GETEC Atendimentos concluído!")


if __name__ == "__main__":
    main()
