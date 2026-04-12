#!/usr/bin/env python3
"""ETL Dengue Projections: projecao linear simples (Fase 3.C).

Para cada municipio com >= 4 semanas de dados em dengue_data, calcula uma
regressao linear simples (Python stdlib, sem scikit-learn) e projeta os
proximos 4 valores semanais. Armazena em dengue_projections.

Municipios com tendencia de alta (slope > 0 e R^2 > 0.3) sao marcados
como candidatos a alerta preventivo.

Roda diariamente via cron-dengue-projections.yml.
"""

import os
import sys
from datetime import datetime, timezone
from collections import defaultdict

import requests
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

MIN_WEEKS = 4
BASELINE_WEEKS = 8
PROJECTION_WEEKS = 4


def postgrest_get(table: str, select: str = "*", params: dict | None = None, limit: int = 10000) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    get_headers = {**HEADERS, "Range": f"0-{limit - 1}"}
    try:
        resp = requests.get(url, headers=get_headers, timeout=30)
        if resp.status_code not in (200, 206):
            print(f"  WARN: GET {table} -> HTTP {resp.status_code}")
            return []
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"  WARN: GET {table} -> {e}")
        return []


def postgrest_post(table: str, records: list, on_conflict: str | None = None) -> bool:
    if not records:
        return True
    post_headers = {**HEADERS, "Prefer": "return=minimal"}
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    for i in range(0, len(records), 200):
        batch = records[i:i + 200]
        resp = requests.post(url, headers=post_headers, json=batch, timeout=30)
        if resp.status_code not in (200, 201, 204):
            print(f"  ERRO POST {table}: HTTP {resp.status_code} - {resp.text[:200]}")
            return False
    return True


def linear_regression(x: list[float], y: list[float]) -> tuple[float, float, float]:
    """Simple linear regression using stdlib only.

    Returns (slope, intercept, r_squared).
    """
    n = len(x)
    if n < 2:
        return 0.0, 0.0, 0.0

    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi * xi for xi in x)
    sum_y2 = sum(yi * yi for yi in y)

    denom = n * sum_x2 - sum_x * sum_x
    if abs(denom) < 1e-10:
        return 0.0, sum_y / n, 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n

    # R-squared
    ss_res = sum((yi - (slope * xi + intercept)) ** 2 for xi, yi in zip(x, y))
    mean_y = sum_y / n
    ss_tot = sum((yi - mean_y) ** 2 for yi in y)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    return slope, intercept, max(0.0, r_squared)


def next_epi_week(year: int, week: int, offset: int = 1) -> tuple[int, int]:
    """Advance epidemiological week by offset."""
    w = week + offset
    y = year
    while w > 52:
        w -= 52
        y += 1
    return y, w


def main():
    start = datetime.now()
    print("=== ETL Projecao Dengue (Fase 3.C) ===")

    # 1. Fetch all dengue data (paginated, Supabase caps at 1000/request)
    print("\n[1/3] Buscando dados de dengue...")
    rows = []
    page = 0
    while True:
        batch = postgrest_get(
            "dengue_data",
            select="ibge_code,municipality_name,epidemiological_week,year,cases",
            params={"order": "year.asc,epidemiological_week.asc", "limit": "1000", "offset": str(page * 1000)},
        )
        rows.extend(batch)
        if len(batch) < 1000:
            break
        page += 1
    print(f"  {len(rows)} registros ({page + 1} paginas)")

    if not rows:
        print("  Sem dados de dengue, abortando")
        return

    # 2. Group by municipality, aggregate by week
    print("\n[2/3] Calculando projecoes...")
    by_muni: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        code = r.get("ibge_code", "")
        if code:
            by_muni[code].append(r)

    projections = []
    trend_alta = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for ibge_code, muni_rows in by_muni.items():
        # Deduplicate and sort by year+week
        seen = set()
        weekly = []
        for r in muni_rows:
            key = (r["year"], r["epidemiological_week"])
            if key not in seen:
                seen.add(key)
                weekly.append(r)
        weekly.sort(key=lambda r: (r["year"], r["epidemiological_week"]))

        # Take last BASELINE_WEEKS
        recent = weekly[-BASELINE_WEEKS:]
        if len(recent) < MIN_WEEKS:
            continue

        municipality = recent[-1].get("municipality_name", "")

        # x = sequential index (0, 1, 2, ...), y = cases
        x = list(range(len(recent)))
        y = [float(r.get("cases", 0) or 0) for r in recent]

        slope, intercept, r_squared = linear_regression(
            [float(xi) for xi in x], y
        )

        # Determine trend
        if slope > 1 and r_squared > 0.3:
            trend = "alta"
            trend_alta += 1
        elif slope < -1 and r_squared > 0.3:
            trend = "queda"
        else:
            trend = "estavel"

        # Project next 4 weeks
        last_year = recent[-1]["year"]
        last_week = recent[-1]["epidemiological_week"]
        n = len(recent)

        for offset in range(1, PROJECTION_WEEKS + 1):
            proj_year, proj_week = next_epi_week(last_year, last_week, offset)
            projected_cases = max(0, slope * (n - 1 + offset) + intercept)

            projections.append({
                "ibge_code": ibge_code,
                "municipality": municipality,
                "projected_week": proj_week,
                "projected_year": proj_year,
                "projected_cases": round(projected_cases, 1),
                "trend": trend,
                "slope": round(slope, 3),
                "r_squared": round(r_squared, 3),
                "baseline_weeks": len(recent),
                "calculated_at": now_iso,
            })

    print(f"  {len(by_muni)} municipios processados")
    print(f"  {len(projections)} projecoes geradas ({PROJECTION_WEEKS} semanas x {len(projections) // max(PROJECTION_WEEKS, 1)} munis)")
    print(f"  {trend_alta} municipios em tendencia de alta")

    # 3. Persist
    print("\n[3/3] Persistindo projecoes...")
    if projections:
        # Delete old projections first (full refresh)
        del_resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/dengue_projections?calculated_at=lt.{now_iso}",
            headers={**HEADERS, "Prefer": "return=minimal"},
            timeout=30,
        )
        if del_resp.status_code in (200, 204):
            print(f"  Projecoes antigas removidas")

        postgrest_post("dengue_projections", projections,
                       on_conflict="ibge_code,projected_week,projected_year")
        print(f"  {len(projections)} projecoes salvas")

    # Summary: top 10 em alta
    alta = [p for p in projections if p["trend"] == "alta"]
    if alta:
        # Group by municipality, take first projection
        seen_munis = {}
        for p in alta:
            if p["ibge_code"] not in seen_munis:
                seen_munis[p["ibge_code"]] = p
        top = sorted(seen_munis.values(), key=lambda p: p["slope"], reverse=True)[:10]
        print("\n  Top 10 municipios em tendencia de alta:")
        for p in top:
            print(f"    {p['municipality']}: slope={p['slope']} casos/sem, R2={p['r_squared']}")

    duration = (datetime.now() - start).total_seconds()
    print(f"\nETL Projecao Dengue concluido em {duration:.1f}s")


if __name__ == "__main__":
    main()
