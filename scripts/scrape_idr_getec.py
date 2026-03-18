#!/usr/bin/env python3
"""
IDR-GETEC Scraper — Extracts client data and reports from idrgetec.idr.pr.gov.br
Saves raw data to data/idr-getec-raw/ (gitignored)

Usage:
    py scripts/scrape_idr_getec.py              # Full scrape
    py scripts/scrape_idr_getec.py --test        # Test with 1 municipality
    py scripts/scrape_idr_getec.py --mun 690     # Scrape specific municipality
"""

import csv
import json
import os
import re
import sys
import time
from pathlib import Path
from datetime import datetime

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

# Fix Windows encoding
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_URL = "http://www.idrgetec.idr.pr.gov.br"
LOGIN_URL = f"{BASE_URL}/seglogin.php"
PRINCIPAL_URL = f"{BASE_URL}/principal.php"
SEARCH_URL = f"{BASE_URL}/telapesquisa/telapesquisa_regcli.php"
CLIENT_LIST_URL = f"{BASE_URL}/lista/lista_regcli.php"
CLIENT_DETAIL_URL = f"{BASE_URL}/clientes/menu.php"
CLIENT_BUSCA_URL = f"{BASE_URL}/busca/busca_regcli1.php"

USUARIO = os.environ.get("IDR_GETEC_USUARIO", "")
SENHA = os.environ.get("IDR_GETEC_SENHA", "")

if not USUARIO or not SENHA:
    print("[!] Set IDR_GETEC_USUARIO and IDR_GETEC_SENHA environment variables")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "idr-getec-raw"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REQUEST_DELAY = 0.25  # seconds between requests
PAGE_SIZE = 100  # records per page request


def create_session():
    """Create and authenticate a session with automatic retry."""
    session = requests.Session()
    retry = Retry(total=5, backoff_factor=1.0, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": f"{BASE_URL}/principal.php",
    })

    print("[*] Logging in...")
    resp = session.post(LOGIN_URL, data={"usuario": USUARIO, "pass": SENHA},
                        allow_redirects=True)

    # Verify
    resp = session.get(f"{PRINCIPAL_URL}?content=cad_regcli.php")
    if "Cadastro do Cliente" not in resp.text:
        print("[!] Login failed")
        sys.exit(1)

    print("[+] Login successful!")
    return session


def extract_municipios(session):
    """Extract all municipality codes from the cadastro form.

    The IDR-GETEC HTML uses unquoted option values like:
      <option value=10>Abatiá
    So we need a regex that handles both quoted and unquoted values.
    """
    print("[*] Extracting municipality codes...")

    resp = session.get(f"{PRINCIPAL_URL}?content=cad_regcli.php")
    text = resp.content.decode("utf-8", errors="replace")

    # Match: <option value=10>Name  OR  <option value="10">Name
    options = re.findall(
        r'<option\s+value=["\']?(\d+)["\']?[^>]*>\s*([^<]+)',
        text
    )

    municipios = {}
    for val, name in options:
        code = int(val)
        name = name.strip()
        if code >= 10 and len(name) > 2 and "Selecione" not in name:
            municipios[code] = name

    # Fallback: try search page
    if len(municipios) < 100:
        resp = session.get(SEARCH_URL, params={"id": "1", "id2": USUARIO, "id3": "-1"})
        text = resp.content.decode("utf-8", errors="replace")
        options = re.findall(
            r'<option\s+value=["\']?(\d+)["\']?[^>]*>\s*([^<]+)',
            text
        )
        for val, name in options:
            code = int(val)
            name = name.strip()
            if code >= 10 and len(name) > 2 and "Selecione" not in name:
                municipios[code] = name

    print(f"[+] Found {len(municipios)} municipalities")

    filepath = OUTPUT_DIR / "municipios.json"
    filepath.write_text(json.dumps(municipios, indent=2, ensure_ascii=False), encoding="utf-8")
    return municipios


def scrape_clients_for_municipality(session, mun_code, mun_name):
    """
    Scrape all clients for a municipality using the AJAX endpoint.

    The endpoint is: /lista/lista_regcli.php?id=<nome>,<cod_mun>,<page_size>,<offset>
    Response: HTML_TABLE@@@TOTAL_COUNT
    """
    all_clients = []
    offset = 0

    # First request to get total count
    params = f",{mun_code},{PAGE_SIZE},{offset}"
    url = f"{CLIENT_LIST_URL}?id={params}"

    try:
        resp = session.get(url, timeout=30)
    except (requests.ConnectionError, requests.Timeout) as e:
        print(f"    [!] Connection error for {mun_name}: {e}")
        time.sleep(5)
        return all_clients
    if resp.status_code != 200:
        print(f"    [!] HTTP {resp.status_code} for {mun_name}")
        return all_clients

    text = resp.text
    parts = text.split("@@@")
    html_content = parts[0]
    total_count = 0
    if len(parts) > 1:
        # Format is "100/3160" — we want the second number (total)
        count_str = parts[1].strip()
        count_match = re.search(r'/(\d+)', count_str)
        if count_match:
            total_count = int(count_match.group(1))
        else:
            try:
                total_count = int(count_str)
            except ValueError:
                total_count = 0

    if total_count == 0:
        soup = BeautifulSoup(html_content, "html.parser")
        rows = soup.find_all("tr")
        if len(rows) <= 1:
            return all_clients

    # Parse first page
    clients = parse_client_html(html_content, mun_name, mun_code)
    all_clients.extend(clients)

    if total_count > 0:
        print(f"    {mun_name} (code={mun_code}): {total_count} total clients")
    else:
        print(f"    {mun_name} (code={mun_code}): {len(clients)} clients (page 1)")
        return all_clients

    # Paginate through remaining
    while offset + PAGE_SIZE < total_count:
        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY)

        params = f",{mun_code},{PAGE_SIZE},{offset}"
        url = f"{CLIENT_LIST_URL}?id={params}"

        try:
            resp = session.get(url, timeout=30)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(5)
            break
        if resp.status_code != 200:
            break

        parts = resp.text.split("@@@")
        clients = parse_client_html(parts[0], mun_name, mun_code)
        all_clients.extend(clients)

        if not clients:
            break

    return all_clients


def parse_client_html(html, mun_name, mun_code):
    """
    Parse the HTML table returned by lista_regcli.php.

    Links follow pattern: javascript:ChamaReg('client_id|nome|cpf|cod_mun')
    Table columns: Nome, Endereço, CPF, Sexo, Situação
    """
    clients = []
    soup = BeautifulSoup(html, "html.parser")

    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        # Extract client ID from ChamaReg link
        link = cells[0].find("a")
        client_id = ""
        nome = ""
        cpf_from_link = ""

        if link:
            href = link.get("href", "")
            # Pattern: javascript:ChamaReg('478871|Abner G Picinertto|78748275972|690')
            chama_match = re.search(r"ChamaReg\('([^']+)'\)", href)
            if chama_match:
                parts = chama_match.group(1).split("|")
                client_id = parts[0] if len(parts) > 0 else ""
                nome = parts[1].strip() if len(parts) > 1 else ""
                cpf_from_link = parts[2] if len(parts) > 2 else ""

            # Fallback: get name from link text
            if not nome:
                nome = link.get_text(strip=True)

        if not nome:
            nome = cells[0].get_text(strip=True)

        if not nome or nome in ("Nome", ""):
            continue

        record = {
            "client_id": client_id,
            "municipio_code": mun_code,
            "municipio": mun_name,
            "nome": nome,
            "endereco": cells[1].get_text(strip=True) if len(cells) > 1 else "",
            "cpf": cpf_from_link or (cells[2].get_text(strip=True) if len(cells) > 2 else ""),
            "sexo": cells[3].get_text(strip=True) if len(cells) > 3 else "",
            "situacao": cells[4].get_text(strip=True) if len(cells) > 4 else "",
        }
        clients.append(record)

    return clients


def scrape_client_detail(session, client_id):
    """Scrape detailed client data from the client subsystem."""
    detail = {}

    # Main client page
    resp = session.get(f"{CLIENT_DETAIL_URL}?id={client_id}")
    if resp.status_code != 200:
        return detail

    # Busca endpoint for client data
    resp = session.get(f"{CLIENT_BUSCA_URL}?id={client_id}")
    if resp.status_code == 200:
        # This returns client data - might be HTML or JSON
        text = resp.text
        if "@@@" in text:
            parts = text.split("@@@")
        else:
            parts = [text]

        soup = BeautifulSoup(parts[0], "html.parser")

        # Extract all form field values
        for inp in soup.find_all("input"):
            name = inp.get("name", inp.get("id", ""))
            value = inp.get("value", "")
            if name and value:
                detail[f"field_{name}"] = value

        # Extract select values
        for sel in soup.find_all("select"):
            name = sel.get("name", sel.get("id", ""))
            selected = sel.find("option", selected=True)
            if name and selected:
                detail[f"field_{name}"] = selected.get_text(strip=True)

        # Extract table data
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                texts = [c.get_text(strip=True) for c in cells]
                if texts:
                    detail[f"table_row_{len(detail)}"] = texts

    return detail


def scrape_atendimentos(session, client_id):
    """Scrape attendance/service records for a client."""
    atendimentos = []

    # Try the individual client registration page
    endpoints = [
        f"{BASE_URL}/lista/lista_regateind.php?id={client_id}",
        f"{BASE_URL}/lista/lista_ateMetInd.php?id={client_id}",
        f"{BASE_URL}/busca/busca_ateMetInd.php?id={client_id}",
    ]

    for endpoint in endpoints:
        try:
            resp = session.get(endpoint)
            if resp.status_code == 200 and len(resp.text) > 100:
                parts = resp.text.split("@@@")
                soup = BeautifulSoup(parts[0], "html.parser")
                rows = soup.find_all("tr")

                for row in rows:
                    cells = row.find_all("td")
                    if len(cells) >= 2:
                        texts = [c.get_text(strip=True) for c in cells]
                        if texts[0] and texts[0] not in ("", "Data"):
                            atendimentos.append({
                                "source": endpoint.split("/")[-1].split("?")[0],
                                "data": texts,
                            })
        except Exception:
            continue

    return atendimentos


def save_clients_csv(clients, filename):
    """Save client list to CSV."""
    if not clients:
        return

    filepath = OUTPUT_DIR / filename
    fieldnames = list(clients[0].keys())

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(clients)

    print(f"[+] Saved {len(clients)} records to {filepath.name}")


def scrape_generic_page(session, url, encoding="utf-8"):
    """Fetch a page, return parsed (soup, raw_text). Returns (None, '') on failure."""
    for attempt in range(3):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code != 200 or len(resp.text) < 50:
                return None, ""
            text = resp.content.decode(encoding, errors="replace")
            parts = text.split("@@@")
            soup = BeautifulSoup(parts[0], "html.parser")
            return soup, text
        except (requests.ConnectionError, requests.Timeout):
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            return None, ""
        except Exception:
            return None, ""


def extract_table_rows(soup):
    """Extract all table rows as list of cell-text lists."""
    rows = []
    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
            if cells and any(cells):
                rows.append(cells)
    return rows


def extract_form_fields(soup):
    """Extract all input/select values from a form page."""
    fields = {}
    for inp in soup.find_all("input"):
        name = inp.get("name", inp.get("id", ""))
        value = inp.get("value", "")
        if name and value:
            fields[name] = value
    for sel in soup.find_all("select"):
        name = sel.get("name", sel.get("id", ""))
        selected = sel.find("option", selected=True)
        if name and selected:
            fields[name] = selected.get_text(strip=True)
    return fields


def save_json(data, filename):
    """Save data as JSON to OUTPUT_DIR."""
    if not data:
        return
    filepath = OUTPUT_DIR / filename
    filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[+] Saved {len(data)} records to {filepath.name}")


# ─── PROGRAMAÇÃO ──────────────────────────────────────────────────────────────


def scrape_programacao(session, municipios):
    """Scrape programming modules: microbacias, eventos, ações."""
    print("\n[*] Scraping programação (microbacias, eventos, ações)...")

    modules = [
        ("prog_micro", "cad_prog_micro.php", "lista/lista_prog_micro.php"),
        ("prog_evento", "cad_prog_evento.php", "lista/lista_prog_evento.php"),
        ("prog_acao", "cad_prog_acao.php", "lista/lista_prog_acao.php"),
    ]

    for mod_name, cad_page, list_endpoint in modules:
        all_records = []

        for mun_code, mun_name in sorted(municipios.items()):
            # Try the list endpoint with municipality code
            url = f"{BASE_URL}/{list_endpoint}?id=,{mun_code},{PAGE_SIZE},0"
            soup, text = scrape_generic_page(session, url)
            if not soup:
                continue

            rows = extract_table_rows(soup)
            for row in rows:
                all_records.append({
                    "municipio_code": mun_code,
                    "municipio": mun_name,
                    "dados": row,
                })
            time.sleep(REQUEST_DELAY * 0.5)

        save_json(all_records, f"{mod_name}.json")


# ─── GRUPOS E ORGANIZAÇÕES ───────────────────────────────────────────────────


def scrape_grupos(session, municipios):
    """Scrape grupo de assistidos and organization links per municipality."""
    print("\n[*] Scraping grupos de assistidos e organizações...")

    group_endpoints = [
        ("grupos_assistidos", "lista/lista_reggru.php"),
        ("organizacoes_upf", "lista/lista_organizacli.php"),
    ]

    for mod_name, list_endpoint in group_endpoints:
        all_records = []

        for mun_code, mun_name in sorted(municipios.items()):
            url = f"{BASE_URL}/{list_endpoint}?id=,{mun_code},{PAGE_SIZE},0"
            soup, text = scrape_generic_page(session, url)
            if not soup:
                continue

            rows = extract_table_rows(soup)
            for row in rows:
                all_records.append({
                    "municipio_code": mun_code,
                    "municipio": mun_name,
                    "dados": row,
                })

            # Handle pagination
            if "@@@" in text:
                parts = text.split("@@@")
                count_match = re.search(r'/(\d+)', parts[1].strip()) if len(parts) > 1 else None
                total = int(count_match.group(1)) if count_match else 0
                offset = PAGE_SIZE
                while offset < total:
                    url = f"{BASE_URL}/{list_endpoint}?id=,{mun_code},{PAGE_SIZE},{offset}"
                    soup2, _ = scrape_generic_page(session, url)
                    if soup2:
                        for row in extract_table_rows(soup2):
                            all_records.append({
                                "municipio_code": mun_code,
                                "municipio": mun_name,
                                "dados": row,
                            })
                    offset += PAGE_SIZE
                    time.sleep(REQUEST_DELAY)

            time.sleep(REQUEST_DELAY * 0.5)

        save_json(all_records, f"{mod_name}.json")


# ─── REGISTROS DE ATENDIMENTO (COLETIVOS) ────────────────────────────────────


def scrape_atendimentos_coletivos(session, municipios):
    """Scrape collective attendance records per municipality."""
    print("\n[*] Scraping atendimentos coletivos...")

    endpoints = [
        ("atend_coletivo_clientes", "lista/lista_ateMetGru.php"),
        ("atend_coletivo_agro", "lista/lista_agro_grupo.php"),
        ("atend_coletivo_orga", "lista/lista_orga_grupo.php"),
    ]

    for mod_name, list_endpoint in endpoints:
        all_records = []

        for mun_code, mun_name in sorted(municipios.items()):
            url = f"{BASE_URL}/{list_endpoint}?id=,{mun_code},{PAGE_SIZE},0"
            soup, _ = scrape_generic_page(session, url)
            if not soup:
                continue

            rows = extract_table_rows(soup)
            for row in rows:
                all_records.append({
                    "municipio_code": mun_code,
                    "municipio": mun_name,
                    "dados": row,
                })
            time.sleep(REQUEST_DELAY * 0.5)

        save_json(all_records, f"{mod_name}.json")


# ─── REGISTROS INDIVIDUAIS (AGRO, ORGANIZAÇÕES, PREFEITURAS) ─────────────────


def scrape_registros_individuais(session, municipios):
    """Scrape individual service records: agroindustry, organizations, prefeituras."""
    print("\n[*] Scraping registros individuais (agro, orga, prefeituras)...")

    endpoints = [
        ("reg_agro", "lista/lista_agro.php"),
        ("reg_orga", "lista/lista_orga.php"),
        ("reg_prefeituras", "lista/lista_orga_prefeituras.php"),
    ]

    for mod_name, list_endpoint in endpoints:
        all_records = []

        for mun_code, mun_name in sorted(municipios.items()):
            url = f"{BASE_URL}/{list_endpoint}?id=,{mun_code},{PAGE_SIZE},0"
            soup, _ = scrape_generic_page(session, url)
            if not soup:
                continue

            rows = extract_table_rows(soup)
            for row in rows:
                all_records.append({
                    "municipio_code": mun_code,
                    "municipio": mun_name,
                    "dados": row,
                })
            time.sleep(REQUEST_DELAY * 0.5)

        save_json(all_records, f"{mod_name}.json")


# ─── EXTENSIONISTAS ──────────────────────────────────────────────────────────


def scrape_extensionistas(session, municipios):
    """Scrape extensionist registration data per municipality."""
    print("\n[*] Scraping extensionistas...")

    all_records = []
    for mun_code, mun_name in sorted(municipios.items()):
        url = f"{BASE_URL}/lista/lista_ext1.php?id=,{mun_code},{PAGE_SIZE},0"
        soup, _ = scrape_generic_page(session, url)
        if not soup:
            continue

        rows = extract_table_rows(soup)
        for row in rows:
            all_records.append({
                "municipio_code": mun_code,
                "municipio": mun_name,
                "dados": row,
            })
        time.sleep(REQUEST_DELAY * 0.5)

    save_json(all_records, "extensionistas.json")


# ─── MONITORAMENTO / RELATÓRIOS ──────────────────────────────────────────────


def scrape_monitoramento(session, municipios):
    """Scrape monitoring summary pages.

    Note: Most Monitoramento reports generate PDFs via pti_comppdf.php
    and are not scrapeable as HTML tables. We only scrape the 'situacao'
    and 'resumo' pages that render inline content.
    """
    print("\n[*] Scraping resumo executivo e situação...")

    # These pages render inside principal.php?content= with inline data
    summary_pages = [
        ("resumo_executivo", f"{PRINCIPAL_URL}?content=resumo.php"),
        ("situacao_extensionista", f"{PRINCIPAL_URL}?content=situacao.php"),
        ("situacao_efetividade", f"{PRINCIPAL_URL}?content=situacao_efetivo.php"),
        ("situacao_projeto", f"{PRINCIPAL_URL}?content=situacao_projeto.php"),
    ]

    for name, url in summary_pages:
        soup, text = scrape_generic_page(session, url)
        if not soup:
            print(f"    {name}: no data")
            continue

        rows = extract_table_rows(soup)
        if rows:
            save_json(rows, f"{name}.json")
            print(f"    {name}: {len(rows)} rows")
        else:
            # Save raw HTML for later manual inspection
            filepath = OUTPUT_DIR / f"{name}.html"
            filepath.write_text(text, encoding="utf-8")
            print(f"    {name}: saved HTML ({len(text)} bytes)")

        time.sleep(REQUEST_DELAY)


# ─── DEPENDENT SELECT DATA ───────────────────────────────────────────────────


def scrape_select_data(session):
    """Scrape dependent select/dropdown reference data via pegaselect.php."""
    print("\n[*] Scraping select reference data (pegaselect.php)...")

    # Known select types from JS analysis
    select_types = list(range(1, 20))

    all_selects = {}
    for tip in select_types:
        url = f"{BASE_URL}/pegaselect.php?id=&tip={tip}"
        soup, text = scrape_generic_page(session, url)
        if not text or len(text) < 10:
            continue

        # Parse options
        options = re.findall(
            r'<option\s+value=["\']?([^"\'>\s]+)["\']?[^>]*>([^<]+)',
            text
        )
        if options:
            all_selects[f"tipo_{tip}"] = [
                {"value": v, "label": l.strip()}
                for v, l in options
                if v not in ("-1", "0", "")
            ]
            print(f"    tipo {tip}: {len(options)} options")

        time.sleep(REQUEST_DELAY * 0.5)

    save_json(all_selects, "select_reference_data.json")


def scrape_cotacoes(session):
    """Scrape agricultural commodity quotes."""
    print("\n[*] Scraping commodity quotes...")
    resp = session.get(f"{PRINCIPAL_URL}?content=bolsa.php")
    soup = BeautifulSoup(resp.text, "html.parser")

    # The page uses a select that triggers JS to load data
    # Look for the select and its onchange handler
    scripts = soup.find_all("script")
    for script in scripts:
        text = script.string or ""
        if "bolsa" in text.lower() or "cultura" in text.lower():
            # Find the AJAX endpoint for quotes
            urls = re.findall(r'["\']([^"\']*\.php[^"\']*)["\']', text)
            print(f"    Quote endpoints: {urls}")

    # Try fetching each culture via AJAX-style endpoint
    culturas_map = {
        "1": "SELIC", "2": "Dolar", "3": "Boi Gordo", "4": "Café",
        "5": "Laranja", "6": "Leite", "7": "Milho", "8": "Soja", "9": "Trigo"
    }

    all_quotes = []
    for code, name in culturas_map.items():
        # Try different endpoint patterns
        for endpoint in [
            f"{BASE_URL}/busca/busca_bolsa.php?id={code}",
            f"{BASE_URL}/lista/lista_bolsa.php?id={code}",
        ]:
            try:
                resp = session.get(endpoint)
                if resp.status_code == 200 and len(resp.text) > 50:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    tables = soup.find_all("table")
                    for table in tables:
                        for row in table.find_all("tr"):
                            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
                            if cells:
                                all_quotes.append({"cultura": name, "dados": cells})
                    if tables:
                        print(f"    {name}: {len(tables)} tables found via {endpoint.split('/')[-1]}")
                        break
            except Exception:
                continue
        time.sleep(REQUEST_DELAY)

    filepath = OUTPUT_DIR / "cotacoes_agricolas.json"
    filepath.write_text(json.dumps(all_quotes, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[+] Saved {len(all_quotes)} quote records")


def scrape_report_tables(session):
    """
    Scrape the report table reference data (Ações, Projetos, etc.).
    These open via javascript:ChamaReg() calls.
    """
    print("\n[*] Scraping report reference tables...")

    report_endpoints = [
        ("acoes", f"{BASE_URL}/relatorios/rel_tb_aca.php?id=1"),
        ("projetos_acoes", f"{BASE_URL}/relatorios/rel_tb_pac.php?id=5"),
        ("projetos", f"{BASE_URL}/relatorios/rel_tb_pro.php?id=1"),
        ("extensionistas_orgao", f"{BASE_URL}/relatorios/rel_tb_ext.php?id=1"),
        ("extensionistas_origem", f"{BASE_URL}/relatorios/rel_ext_origem.php?id=0"),
    ]

    for name, url in report_endpoints:
        try:
            resp = session.get(url)
            if resp.status_code == 200 and len(resp.text) > 100:
                filepath = OUTPUT_DIR / f"tabela_{name}.html"
                filepath.write_text(resp.text, encoding="utf-8")
                print(f"    {name}: saved ({len(resp.text)} bytes)")

                # Try to parse as table
                soup = BeautifulSoup(resp.text, "html.parser")
                tables = soup.find_all("table")
                if tables:
                    all_rows = []
                    for table in tables:
                        for row in table.find_all("tr"):
                            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
                            if cells:
                                all_rows.append(cells)
                    if all_rows:
                        filepath = OUTPUT_DIR / f"tabela_{name}.json"
                        filepath.write_text(json.dumps(all_rows, indent=2, ensure_ascii=False),
                                            encoding="utf-8")
        except Exception as e:
            print(f"    {name}: error - {e}")
        time.sleep(REQUEST_DELAY)


def scrape_escritorios_all(session, municipios):
    """Scrape office data for all municipalities."""
    print("\n[*] Scraping escritórios municipais...")

    # Try the busca endpoint
    all_offices = []
    for mun_code, mun_name in sorted(municipios.items()):
        endpoint = f"{BASE_URL}/busca/busca_escritorios.php?id={mun_code}"
        try:
            resp = session.get(endpoint)
            if resp.status_code == 200 and len(resp.text) > 50:
                parts = resp.text.split("@@@")
                soup = BeautifulSoup(parts[0], "html.parser")

                # Extract field values
                office = {"municipio_code": mun_code, "municipio": mun_name}
                for inp in soup.find_all("input"):
                    name = inp.get("name", inp.get("id", ""))
                    value = inp.get("value", "")
                    if name and value:
                        office[name] = value

                if len(office) > 2:
                    all_offices.append(office)
        except Exception:
            pass
        time.sleep(REQUEST_DELAY * 0.5)

    if all_offices:
        filepath = OUTPUT_DIR / "escritorios_municipais.json"
        filepath.write_text(json.dumps(all_offices, indent=2, ensure_ascii=False),
                            encoding="utf-8")
        print(f"[+] Saved {len(all_offices)} offices")

    return all_offices


def main():
    """Main scraping orchestrator."""
    print("=" * 60)
    print("IDR-GETEC Scraper for C2-Paraná")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)

    # Parse args
    test_mode = "--test" in sys.argv
    specific_mun = None
    if "--mun" in sys.argv:
        idx = sys.argv.index("--mun")
        if idx + 1 < len(sys.argv):
            specific_mun = int(sys.argv[idx + 1])

    # Phase 1: Login
    session = create_session()

    # Phase 2: Extract municipality codes
    municipios = extract_municipios(session)

    # Phase 3: Test client scraping mechanism
    print("\n[*] Testing client list endpoint...")
    test_mun = specific_mun or 690  # Curitiba

    # Test the AJAX endpoint directly
    test_url = f"{CLIENT_LIST_URL}?id=,{test_mun},{PAGE_SIZE},0"
    print(f"    Testing: {test_url}")
    resp = session.get(test_url)
    print(f"    Response: {resp.status_code}, {len(resp.text)} bytes")

    if resp.text:
        filepath = OUTPUT_DIR / "test_client_list_response.html"
        filepath.write_text(resp.text, encoding="utf-8")

        parts = resp.text.split("@@@")
        print(f"    Parts: {len(parts)}")
        if len(parts) > 1:
            print(f"    Total count: {parts[1].strip()}")

        clients = parse_client_html(parts[0], municipios.get(test_mun, "Test"), test_mun)
        print(f"    Parsed clients: {len(clients)}")

        if clients:
            print(f"    First client: {clients[0]}")
            save_clients_csv(clients, "test_clients.csv")

    if test_mode:
        print("\n[TEST MODE] Scraping only 1 municipality")
        clients = scrape_clients_for_municipality(session, test_mun,
                                                   municipios.get(test_mun, "Test"))
        save_clients_csv(clients, f"clients_{test_mun}.csv")

        # Test client detail
        if clients and clients[0].get("client_id"):
            cid = clients[0]["client_id"]
            print(f"\n[*] Testing client detail for ID={cid}...")
            detail = scrape_client_detail(session, cid)
            if detail:
                filepath = OUTPUT_DIR / f"client_detail_{cid}.json"
                filepath.write_text(json.dumps(detail, indent=2, ensure_ascii=False),
                                    encoding="utf-8")
                print(f"    Detail fields: {len(detail)}")

            print(f"[*] Testing atendimentos for ID={cid}...")
            atend = scrape_atendimentos(session, cid)
            if atend:
                filepath = OUTPUT_DIR / f"client_atendimentos_{cid}.json"
                filepath.write_text(json.dumps(atend, indent=2, ensure_ascii=False),
                                    encoding="utf-8")
                print(f"    Atendimentos: {len(atend)}")

        # Also scrape reports, quotes, and new modules
        scrape_cotacoes(session)
        scrape_report_tables(session)

        # Test new modules with single municipality
        test_munis = {test_mun: municipios.get(test_mun, "Test")}
        scrape_programacao(session, test_munis)
        scrape_grupos(session, test_munis)
        scrape_registros_individuais(session, test_munis)
        scrape_atendimentos_coletivos(session, test_munis)
        scrape_extensionistas(session, test_munis)
        scrape_monitoramento(session, municipios)  # uses full municipios for summary pages
        scrape_select_data(session)

        print(f"\n[+] Test complete! Check {OUTPUT_DIR}")
        return

    # ─── FULL SCRAPE ──────────────────────────────────────────────────────

    if specific_mun:
        target_muns = {specific_mun: municipios.get(specific_mun, f"Code_{specific_mun}")}
    else:
        target_muns = municipios

    # Phase 4: Scrape all clients by municipality
    print(f"\n[*] Scraping clients for {len(target_muns)} municipalities...")
    all_clients = []
    progress = 0

    for mun_code, mun_name in sorted(target_muns.items()):
        progress += 1
        if progress % 20 == 0:
            print(f"    Progress: {progress}/{len(target_muns)} municipalities...")

        clients = scrape_clients_for_municipality(session, mun_code, mun_name)
        all_clients.extend(clients)

        # Save per-municipality file
        if clients:
            safe_name = re.sub(r'[^\w]', '_', mun_name)[:30]
            save_clients_csv(clients, f"clients_{mun_code}_{safe_name}.csv")

        time.sleep(REQUEST_DELAY)

    # Save combined file
    save_clients_csv(all_clients, "all_clients.csv")

    # Phase 5: Scrape client details (sample — first 10 per municipality)
    print(f"\n[*] Scraping client details (sampling)...")
    all_details = []
    all_atendimentos = []
    sampled = 0

    for client in all_clients[:500]:  # Limit to first 500 for initial run
        cid = client.get("client_id")
        if not cid:
            continue

        detail = scrape_client_detail(session, cid)
        if detail:
            detail["client_id"] = cid
            detail["municipio"] = client.get("municipio", "")
            all_details.append(detail)

        atend = scrape_atendimentos(session, cid)
        if atend:
            for a in atend:
                a["client_id"] = cid
            all_atendimentos.extend(atend)

        sampled += 1
        if sampled % 50 == 0:
            print(f"    Sampled {sampled} client details...")

        time.sleep(REQUEST_DELAY)

    filepath = OUTPUT_DIR / "client_details.json"
    filepath.write_text(json.dumps(all_details, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[+] Saved {len(all_details)} client details")

    filepath = OUTPUT_DIR / "client_atendimentos.json"
    filepath.write_text(json.dumps(all_atendimentos, indent=2, ensure_ascii=False),
                        encoding="utf-8")
    print(f"[+] Saved {len(all_atendimentos)} atendimento records")

    # Phase 6: Supplementary data
    scrape_cotacoes(session)
    scrape_report_tables(session)
    scrape_escritorios_all(session, municipios)

    # Phase 7: Programming modules (microbacias, eventos, ações)
    scrape_programacao(session, municipios)

    # Phase 8: Groups and organizations
    scrape_grupos(session, municipios)

    # Phase 9: Individual service records (agro, orga, prefeituras)
    scrape_registros_individuais(session, municipios)

    # Phase 10: Collective attendance records
    scrape_atendimentos_coletivos(session, municipios)

    # Phase 11: Extensionists
    scrape_extensionistas(session, municipios)

    # Phase 12: Monitoring/reports
    scrape_monitoramento(session, municipios)

    # Phase 13: Reference select data
    scrape_select_data(session)

    print("\n" + "=" * 60)
    print("Scraping complete!")
    print(f"Total clients: {len(all_clients)}")
    print(f"Total details: {len(all_details)}")
    print(f"Total atendimentos: {len(all_atendimentos)}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
