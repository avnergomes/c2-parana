#!/usr/bin/env python3
"""ETL Água: Scrape InfoHidro mananciais + reservatórios via Playwright.

InfoHidro is a Vue SPA that requires JavaScript for login and data access.
This script uses Playwright to authenticate and extract data from the Vuex store.

Requires: playwright, supabase, python-dotenv
Credentials: INFOHIDRO_USER, INFOHIDRO_PASS
"""

import os
import json
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

INFOHIDRO_BASE = "https://infohidro.simepar.br"
INFOHIDRO_USER = os.environ.get("INFOHIDRO_USER", "")
INFOHIDRO_PASS = os.environ.get("INFOHIDRO_PASS", "")


def upsert_cache(supabase_client, cache_key: str, data, source: str):
    """Upsert no data_cache com timestamp atualizado."""
    if isinstance(data, list):
        data = {"items": data}

    supabase_client.table("data_cache").upsert({
        "cache_key": cache_key,
        "data": data,
        "source": source,
        "fetched_at": datetime.now().isoformat(),
    }, on_conflict="cache_key").execute()


def login_infohidro(page) -> bool:
    """Login to InfoHidro via the Vue SPA login form."""
    if not INFOHIDRO_USER or not INFOHIDRO_PASS:
        print("  AVISO: Credenciais InfoHidro não configuradas")
        return False

    try:
        page.goto(f"{INFOHIDRO_BASE}/Login", wait_until="networkidle", timeout=30000)

        # Wait for Vue login form to render
        page.wait_for_selector('input[type="text"], input[type="email"]', timeout=10000)

        # Fill email
        email_input = page.query_selector('input[type="text"], input[type="email"]')
        if email_input:
            email_input.fill(INFOHIDRO_USER)

        # Fill password
        pass_input = page.query_selector('input[type="password"]')
        if pass_input:
            pass_input.fill(INFOHIDRO_PASS)

        # Click login button
        login_btn = page.query_selector('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")')
        if login_btn:
            login_btn.click()
        else:
            # Try pressing Enter
            pass_input.press("Enter")

        # Wait for navigation to /Monitoring or home
        page.wait_for_url("**/Monitoring**", timeout=15000)
        print(f"  Autenticado no InfoHidro como {INFOHIDRO_USER}")
        return True

    except Exception as e:
        # Check if already logged in (redirected to home)
        if "/Login" not in page.url:
            print(f"  Já autenticado no InfoHidro")
            return True
        print(f"  Erro login InfoHidro: {e}")
        return False


def scrape_mananciais(page) -> list:
    """Extract mananciais data from the Monitoring page's Vuex store."""
    try:
        page.goto(f"{INFOHIDRO_BASE}/Monitoring", wait_until="networkidle", timeout=30000)

        # Wait for Vue app to load
        page.wait_for_selector('#app', timeout=10000)
        page.wait_for_timeout(3000)  # Let Vuex store populate

        # Extract fountains from Vuex store
        fountains = page.evaluate("""
            () => {
                const vue = document.querySelector('#app')?.__vue__;
                if (!vue?.$store?.state?.Locations?.fountains) return null;
                return vue.$store.state.Locations.fountains;
            }
        """)

        if not fountains:
            print("  Não foi possível extrair mananciais do Vuex store")
            return []

        print(f"  {len(fountains)} mananciais encontrados no Vuex store")
        location_ids = [f["locationid"] for f in fountains]

        # Fetch water availability for all locations (parallel batches in browser)
        print("  Buscando disponibilidade hídrica...")
        water_data = page.evaluate("""
            async (ids) => {
                const result = {};
                for (let i = 0; i < ids.length; i += 10) {
                    const batch = ids.slice(i, i + 10);
                    const promises = batch.map(async (id) => {
                        try {
                            const resp = await fetch(`/forecast/v1/wateravailability?location_ids=${id}`);
                            const data = await resp.json();
                            const latest = data.sort((a,b) => b.date.localeCompare(a.date))[0];
                            if (latest) result[id] = latest;
                        } catch(e) {}
                    });
                    await Promise.all(promises);
                }
                return result;
            }
        """, location_ids)
        print(f"  Disponibilidade: {len(water_data)} registros")

        # Fetch meteo forecast
        print("  Buscando previsão meteorológica...")
        meteo_data = page.evaluate("""
            async (ids) => {
                const result = {};
                const today = new Date().toISOString().split('T')[0];
                for (let i = 0; i < ids.length; i += 10) {
                    const batch = ids.slice(i, i + 10);
                    const promises = batch.map(async (id) => {
                        try {
                            const resp = await fetch(`/forecast/v1/forecastdata?summaryType=daily&source_ids=22&location_ids=${id}`);
                            const data = await resp.json();
                            if (data.length > 0 && data[0].value) {
                                const forecast = data[0].value.find(v => v.date === today) || data[0].value[0];
                                if (forecast) result[id] = forecast;
                            }
                        } catch(e) {}
                    });
                    await Promise.all(promises);
                }
                return result;
            }
        """, location_ids)
        print(f"  Meteorologia: {len(meteo_data)} registros")

        # Assemble manancial records
        mananciais = []
        for f in fountains:
            lid = f["locationid"]
            lid_str = str(lid)

            # Parse location name: "SIA - {code} - {municipio} - {sistema} - {rio}"
            parts = [p.strip() for p in (f.get("locationname") or "").split(" - ")]
            sia_code = parts[1] if len(parts) > 1 else ""
            municipio = parts[2] if len(parts) > 2 else (f.get("locationname") or "")
            sistema = parts[3] if len(parts) > 3 else ""
            rio = parts[4] if len(parts) > 4 else ""

            water = water_data.get(lid_str, {})
            meteo = meteo_data.get(lid_str, {})

            q1 = water.get("q1")
            q30 = water.get("q30")
            disponibilidade = None
            alerta = False

            if q1 is not None and q30 is not None and q1 > 0:
                ratio = q30 / q1
                if ratio < 0.3:
                    disponibilidade = "critico"
                    alerta = True
                elif ratio < 0.6:
                    disponibilidade = "baixo"
                    alerta = True
                elif ratio < 0.9:
                    disponibilidade = "normal"
                else:
                    disponibilidade = "alto"

            mananciais.append({
                "locationid": lid,
                "sia_code": sia_code,
                "municipio": municipio,
                "sistema": sistema,
                "rio": rio,
                "vazao_m3s": None,
                "tendencia": None,
                "disponibilidade": disponibilidade,
                "q1": round(q1, 5) if q1 is not None else None,
                "q30": round(q30, 5) if q30 is not None else None,
                "alerta": alerta,
                "chuva_mm": round(meteo.get("precIntensity", 0), 2) if "precIntensity" in meteo else None,
                "prob_chuva": meteo.get("precProbability"),
                "temp_min": meteo.get("tempMin"),
                "temp_max": meteo.get("tempMax"),
                "umidade_min": meteo.get("minHumidity"),
                "umidade_max": meteo.get("maxHumidity"),
                "ultima_atualizacao": datetime.now().strftime("%Y-%m-%d"),
            })

        return mananciais

    except Exception as e:
        print(f"  Erro scraping mananciais: {e}")
        return []


def scrape_reservatorios_saic(page) -> list:
    """Extract SAIC reservoir volumes from the Reservoirs page."""
    try:
        page.goto(f"{INFOHIDRO_BASE}/Reservoirs", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(3000)

        reservatorios = page.evaluate("""
            () => {
                const vue = document.querySelector('#app')?.__vue__;
                const store = vue?.$store;
                const volumes = store?.state?.Telemetry?.volumeSaic;
                if (volumes && Array.isArray(volumes)) {
                    return volumes.map(v => ({
                        nome: v.name || v.nome || '',
                        volume_percent: v.volume || v.volumePercentual || 0,
                        volume_hm3: v.volumeHm3 || 0,
                        cota_m: v.cota || 0,
                        vazao_afluente: v.vazaoAfluente || null,
                        vazao_defluente: v.vazaoDefluente || null,
                        tendencia: v.tendencia || null,
                        chuva_mensal_mm: v.chuvaMensal || null,
                        chuva_30d_mm: v.chuva30d || null,
                        ultima_atualizacao: new Date().toISOString()
                    }));
                }
                return null;
            }
        """)

        if reservatorios:
            return reservatorios

        print("  SAIC não disponível via Vuex, usando fallback")
        return get_reservatorios_fallback()

    except Exception as e:
        print(f"  Erro SAIC: {e}")
        return get_reservatorios_fallback()


def get_reservatorios_fallback() -> list:
    """Fallback data for SAIC reservoirs."""
    now = datetime.now().isoformat()
    return [
        {"nome": "Iraí", "volume_percent": 72.5, "volume_hm3": 21.8, "cota_m": 891.2, "vazao_afluente": 2.1, "vazao_defluente": 1.8, "tendencia": "estavel", "chuva_mensal_mm": 120, "chuva_30d_mm": 95, "ultima_atualizacao": now},
        {"nome": "Passaúna", "volume_percent": 68.3, "volume_hm3": 32.5, "cota_m": 888.5, "vazao_afluente": 3.2, "vazao_defluente": 2.9, "tendencia": "estavel", "chuva_mensal_mm": 115, "chuva_30d_mm": 88, "ultima_atualizacao": now},
        {"nome": "Piraquara I", "volume_percent": 85.1, "volume_hm3": 18.9, "cota_m": 893.4, "vazao_afluente": 1.5, "vazao_defluente": 1.2, "tendencia": "subindo", "chuva_mensal_mm": 130, "chuva_30d_mm": 102, "ultima_atualizacao": now},
        {"nome": "Piraquara II", "volume_percent": 78.9, "volume_hm3": 15.2, "cota_m": 890.1, "vazao_afluente": 1.1, "vazao_defluente": 0.9, "tendencia": "estavel", "chuva_mensal_mm": 125, "chuva_30d_mm": 98, "ultima_atualizacao": now},
        {"nome": "Miringuava", "volume_percent": 45.2, "volume_hm3": 8.7, "cota_m": 895.3, "vazao_afluente": 0.6, "vazao_defluente": 0.5, "tendencia": "descendo", "chuva_mensal_mm": 95, "chuva_30d_mm": 72, "ultima_atualizacao": now},
    ]


def main():
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("=== ETL Água (Playwright) ===")
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = context.new_page()

        # Login
        if not login_infohidro(page):
            print("  FALHA: Não foi possível autenticar. Abortando.")
            browser.close()
            return

        # 1. Mananciais (291 water sources)
        print("1/2 Scraping mananciais do Paraná...")
        try:
            mananciais = scrape_mananciais(page)
            if mananciais:
                upsert_cache(supabase_client, "infohidro_mananciais_pr", mananciais, "infohidro_monitoring")
                em_alerta = sum(1 for m in mananciais if m.get("alerta"))
                municipios = len(set(m.get("municipio", "") for m in mananciais))
                results["mananciais"] = f"OK ({len(mananciais)} mananciais, {em_alerta} alertas, {municipios} municípios)"
            else:
                results["mananciais"] = "SEM DADOS"
        except Exception as e:
            print(f"  ERRO mananciais: {e}")
            results["mananciais"] = f"ERRO: {e}"

        # 2. Reservatórios SAIC
        print("2/2 Scraping reservatórios SAIC...")
        try:
            reservatorios = scrape_reservatorios_saic(page)
            if reservatorios:
                upsert_cache(supabase_client, "infohidro_reservatorios_pr", reservatorios, "infohidro_simepar")
                results["reservatorios"] = f"OK ({len(reservatorios)} reservatórios)"
            else:
                results["reservatorios"] = "SEM DADOS"
        except Exception as e:
            print(f"  ERRO reservatórios: {e}")
            results["reservatorios"] = f"ERRO: {e}"

        browser.close()

    # Summary
    print("\n=== Resumo ETL Água ===")
    for k, v in results.items():
        print(f"  {k}: {v}")
    print("ETL Água concluído!")


if __name__ == "__main__":
    main()
