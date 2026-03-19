#!/usr/bin/env python3
"""ETL GETEC Extensão Rural: Parse extensionist PDF + projects PDF.

Endpoints (all return PDF):
  - /relatorios/rel_tb_ext.php?id=1  — all extensionists (94+ pages)
  - /relatorios/rel_tb_pro.php?id=1  — projects reference
  - /relatorios/rel_tb_aca.php?id=1  — actions reference

Requires: requests, pdfplumber, beautifulsoup4, supabase, python-dotenv
"""

import io
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pdfplumber
import requests
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

REQUEST_DELAY = 0.5


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
        for endpoint in ["seglogin.php", "login.php"]:
            session.post(
                f"{BASE_URL}/{endpoint}",
                data={"usuario": GETEC_USER, "pass": GETEC_PASS,
                      "matricula": GETEC_USER, "senha": GETEC_PASS},
                timeout=15, allow_redirects=True,
            )
        resp = session.get(f"{BASE_URL}/principal.php?content=cad_regcli.php", timeout=15)
        if "Cadastro" in resp.text or "principal" in resp.url:
            print(f"  Autenticado como {GETEC_USER}")
            return True
        print("  AVISO: Login pode ter falhado")
        return False
    except Exception as e:
        print(f"  Erro login: {e}")
        return False


# ─── PDF PARSING ─────────────────────────────────────────────────────────────


def parse_extensionistas_pdf(pdf_bytes: bytes) -> list[dict]:
    """Parse the full extensionists PDF (rel_tb_ext.php).

    Lines: Código | Nome | Município | Formação | Órgão | Cargo | Ativo/Inativo
    """
    records = []
    if len(pdf_bytes) < 500:
        return records

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                line = line.strip()
                # Skip headers and empty lines
                if not line or line.startswith("Tabela Completa") or line.startswith("Código"):
                    continue

                # Pattern: starts with numeric code, ends with Ativo/Inativo
                match = re.match(r'^(\d{3,10})\s*(.+?)\s+(Ativo|Inativo)\s*$', line)
                if not match:
                    continue

                codigo = match.group(1)
                middle = match.group(2).strip()
                status = match.group(3)

                # Parse middle section: Name Municipality Formation Org Cargo
                # The municipality name is typically 2+ words after the person name
                # We use known cargo patterns to split from the right
                cargo_patterns = [
                    r'Responsável local', r'Extensionista local', r'Coordenador',
                    r'Gerente', r'Pesquisa e Formação', r'Transversal',
                    r'Comunicação', r'Outros estaduais', r'PSS', r'Assessor',
                ]
                cargo = ""
                for cp in cargo_patterns:
                    m = re.search(cp, middle, re.IGNORECASE)
                    if m:
                        cargo = m.group(0).strip()
                        middle = middle[:m.start()].strip()
                        break

                # Try to extract org (IDR Paraná, Prefeitura, etc.)
                org = ""
                org_patterns = [
                    r'I\s*D\s*R\s*P\s*a\s*r\s*a\s*n\s*á', r'IDR Paraná',
                    r'P\s*r\s*efeitura', r'Prefeitura',
                    r'Cooperativa', r'Empresa Privada', r'ONG',
                ]
                for op in org_patterns:
                    m = re.search(op, middle, re.IGNORECASE)
                    if m:
                        org = re.sub(r'\s+', ' ', m.group(0)).strip()
                        middle = middle[:m.start()].strip()
                        break

                # Now middle should be: Name + Municipality + Formation
                # Formation patterns at the end
                formacao = ""
                form_patterns = [
                    r'Engenheiro Agrônomo', r'Técnico Agrícola', r'Nível Superior',
                    r'Pesquisador', r'Auxiliar', r'Médico Veterinário',
                    r'Graduação Superior', r'Assistente Social', r'Sociólogo',
                    r'Zootecnista', r'Engenheiro Florestal', r'Biólogo',
                    r'Pesquisa\s*-\s*Especialista', r'Administrador',
                ]
                for fp in form_patterns:
                    m = re.search(fp, middle, re.IGNORECASE)
                    if m:
                        formacao = m.group(0).strip()
                        middle = middle[:m.start()].strip()
                        break

                # middle is now "Name Municipality" - hard to split perfectly
                # We'll store the full string and aggregate by municipality later
                records.append({
                    "codigo": codigo,
                    "nome_municipio": middle,
                    "formacao": formacao,
                    "orgao": org,
                    "cargo": cargo,
                    "status": status,
                })

    return records


def aggregate_by_municipality(records: list[dict]) -> list[dict]:
    """Aggregate extensionists by municipality.

    Since we can't perfectly split name from municipality in the PDF text,
    we try a heuristic: check if the end of nome_municipio matches known
    municipality names from municipios.json.
    """
    # Load known municipalities
    munis_path = Path(__file__).resolve().parent.parent / "data" / "idr-getec-raw" / "municipios.json"
    known_munis: dict[str, int] = {}
    if munis_path.exists():
        import json
        raw = json.loads(munis_path.read_text(encoding="utf-8"))
        for code, name in raw.items():
            known_munis[name.strip().lower()] = int(code)

    mun_data: dict[str, dict] = defaultdict(lambda: {
        "extensionistas": 0,
        "ativos": 0,
        "nomes": [],
        "formacoes": defaultdict(int),
        "cargos": defaultdict(int),
    })

    unmatched = 0
    for rec in records:
        text = rec["nome_municipio"]
        matched_mun = None
        matched_name = ""

        # Try matching known municipalities from the end of the string
        # Sort by name length descending to match longer names first
        for mun_name in sorted(known_munis.keys(), key=len, reverse=True):
            idx = text.lower().rfind(mun_name)
            if idx > 0:
                # Check it's at a word boundary
                before = text[idx - 1] if idx > 0 else " "
                if before == " ":
                    matched_mun = text[idx:idx + len(mun_name)]
                    matched_name = text[:idx].strip()
                    break

        if not matched_mun:
            unmatched += 1
            continue

        # Normalize municipality name (title case)
        mun_key = matched_mun.strip()
        # Find the proper cased name
        for name in known_munis:
            if name.lower() == mun_key.lower():
                # Get proper name from the original dict
                mun_key_proper = None
                raw_path = Path(__file__).resolve().parent.parent / "data" / "idr-getec-raw" / "municipios.json"
                if raw_path.exists():
                    import json
                    raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
                    for code, mname in raw_data.items():
                        if mname.strip().lower() == name:
                            mun_key_proper = mname.strip()
                            break
                if mun_key_proper:
                    mun_key = mun_key_proper
                break

        entry = mun_data[mun_key]
        entry["extensionistas"] += 1
        if rec["status"] == "Ativo":
            entry["ativos"] += 1
        if matched_name and len(entry["nomes"]) < 20:
            entry["nomes"].append(matched_name)
        if rec["formacao"]:
            entry["formacoes"][rec["formacao"]] += 1
        if rec["cargo"]:
            entry["cargos"][rec["cargo"]] += 1

    if unmatched:
        print(f"  {unmatched} extensionistas sem município identificado")

    # Convert to list
    result = []
    for mun_name, data in sorted(mun_data.items(), key=lambda x: -x[1]["extensionistas"]):
        code = known_munis.get(mun_name.lower(), 0)
        result.append({
            "municipio_code": code,
            "municipio": mun_name,
            "extensionistas": data["extensionistas"],
            "ativos": data["ativos"],
            "nomes": data["nomes"],
            "formacoes": dict(data["formacoes"]),
            "cargos": dict(data["cargos"]),
        })

    return result


def parse_simple_pdf(pdf_bytes: bytes) -> list[dict]:
    """Parse a simple reference PDF (projects, actions) into rows."""
    records = []
    if len(pdf_bytes) < 500:
        return records

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                line = line.strip()
                if not line or "Tabela" in line or "Código" in line:
                    continue
                # Most reference tables: Code Name [Details]
                match = re.match(r'^(\d+)\s+(.+)$', line)
                if match:
                    records.append({
                        "codigo": match.group(1),
                        "nome": match.group(2).strip(),
                    })
    return records


# ─── MAIN ────────────────────────────────────────────────────────────────────


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("=== ETL GETEC Extensão Rural ===")

    session = create_session()
    if not login(session):
        print("  FALHA: Não foi possível autenticar")
        return

    # 1. Extensionists PDF (94+ pages)
    print("\n1/3 Baixando PDF de extensionistas...")
    resp = session.get(f"{BASE_URL}/relatorios/rel_tb_ext.php?id=1", timeout=120)
    if resp.status_code != 200 or resp.content[:4] != b"%PDF":
        print(f"  ERRO: Não é PDF (status={resp.status_code})")
        return
    print(f"  PDF: {len(resp.content):,} bytes")

    print("  Parseando extensionistas...")
    raw_records = parse_extensionistas_pdf(resp.content)
    total_parsed = len(raw_records)
    ativos = sum(1 for r in raw_records if r["status"] == "Ativo")
    print(f"  {total_parsed} registros parseados ({ativos} ativos)")

    print("  Agregando por município...")
    extensionistas = aggregate_by_municipality(raw_records)
    total_ext = sum(e["extensionistas"] for e in extensionistas)
    munis_com_ext = len(extensionistas)
    print(f"  {total_ext} extensionistas em {munis_com_ext} municípios")

    # Global stats by cargo
    all_cargos: dict[str, int] = defaultdict(int)
    all_formacoes: dict[str, int] = defaultdict(int)
    for ext in extensionistas:
        for cargo, count in ext.get("cargos", {}).items():
            all_cargos[cargo] += count
        for form, count in ext.get("formacoes", {}).items():
            all_formacoes[form] += count

    time.sleep(REQUEST_DELAY)

    # 2. Projects PDF
    print("\n2/3 Baixando PDF de projetos...")
    resp2 = session.get(f"{BASE_URL}/relatorios/rel_tb_pro.php?id=1", timeout=60)
    projetos = []
    if resp2.status_code == 200 and resp2.content[:4] == b"%PDF":
        projetos = parse_simple_pdf(resp2.content)
        print(f"  {len(projetos)} projetos")
    else:
        print("  AVISO: Não foi possível obter projetos")

    time.sleep(REQUEST_DELAY)

    # 3. Actions PDF
    print("\n3/3 Baixando PDF de ações...")
    resp3 = session.get(f"{BASE_URL}/relatorios/rel_tb_aca.php?id=1", timeout=60)
    acoes = []
    if resp3.status_code == 200 and resp3.content[:4] == b"%PDF":
        acoes = parse_simple_pdf(resp3.content)
        print(f"  {len(acoes)} ações")
    else:
        print("  AVISO: Não foi possível obter ações")

    # Build payload
    extensao_data = {
        "kpis": {
            "total_extensionistas": total_ext,
            "extensionistas_ativos": ativos,
            "municipios_com_extensionista": munis_com_ext,
            "municipios_sem_extensionista": max(0, 399 - munis_com_ext),
            "media_por_municipio": round(total_ext / munis_com_ext, 1) if munis_com_ext else 0,
            "total_projetos": len(projetos),
            "total_acoes": len(acoes),
            "data_referencia": datetime.now().strftime("%Y-%m-%d"),
        },
        "extensionistas_por_municipio": extensionistas,
        "distribuicao_cargos": dict(sorted(all_cargos.items(), key=lambda x: -x[1])),
        "distribuicao_formacoes": dict(sorted(all_formacoes.items(), key=lambda x: -x[1])),
        "projetos": projetos[:100],
        "acoes": acoes[:100],
    }

    # Save
    print("\nSalvando no Supabase...")
    upsert_cache(sb, "getec_extensao_pr", extensao_data, "idr_getec_extensao")

    print(f"\n=== Resumo ===")
    print(f"  Total parseados: {total_parsed} ({ativos} ativos)")
    print(f"  Agregados: {total_ext} extensionistas em {munis_com_ext} municípios")
    print(f"  Projetos: {len(projetos)}")
    print(f"  Ações: {len(acoes)}")
    if all_cargos:
        print(f"  Top cargos: {dict(list(all_cargos.items())[:5])}")
    print("ETL GETEC Extensão Rural concluído!")


if __name__ == "__main__":
    main()
