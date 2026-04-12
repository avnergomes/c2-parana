#!/usr/bin/env python3
"""ETL Situational Report: gera relatorio situacional diario do Parana (Fase 3.B).

Consolida dados de todos os dominios (clima, saude, ambiente, hidro, ar) e
IRTC scores para produzir um resumo executivo narrativo com:
- KPIs consolidados
- Top 10 municipios por IRTC
- Resumo por dominio
- Recomendacoes acionaveis

Roda 1x/dia as 06:00 BRT (09:00 UTC) via cron-situational.yml.
Upsert por report_date (UNIQUE) para idempotencia.
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta

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
    "Prefer": "return=minimal",
}

BRT = timezone(timedelta(hours=-3))


def postgrest_get(table, select="*", params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"  WARN: GET {table} -> HTTP {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json()


def postgrest_upsert(table, records, on_conflict="id"):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    h = {**HEADERS, "Prefer": f"resolution=merge-duplicates,return=minimal"}
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    resp = requests.post(url, headers=h, json=records, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"  WARN: UPSERT {table} -> HTTP {resp.status_code}: {resp.text[:300]}")
        return False
    return True


# --- Data fetchers ---

def fetch_irtc_top(n=10):
    """Top N municipios por IRTC score."""
    return postgrest_get(
        "irtc_scores",
        "municipality,ibge_code,irtc_score,risk_level,dominant_domain,data_coverage,risk_clima,risk_saude,risk_ambiente,risk_hidro,risk_ar",
        {"order": "irtc_score.desc", "limit": str(n)},
    )


def fetch_irtc_distribution():
    """Distribuicao de risk_level dos 399 municipios."""
    all_scores = postgrest_get("irtc_scores", "risk_level")
    dist = {"baixo": 0, "medio": 0, "alto": 0, "critico": 0}
    for row in all_scores:
        level = row.get("risk_level", "baixo").replace("é", "e").replace("í", "i")
        dist[level] = dist.get(level, 0) + 1
    return dist


def fetch_active_alerts():
    """Contagem de notifications nao-lidas nas ultimas 24h."""
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    rows = postgrest_get(
        "notifications",
        "id,severity",
        {"created_at": f"gte.{since}"},
    )
    by_sev = {}
    for r in rows:
        s = r.get("severity", "low")
        by_sev[s] = by_sev.get(s, 0) + 1
    return len(rows), by_sev


def fetch_dengue_summary():
    """Resumo de dengue da semana mais recente."""
    latest = postgrest_get(
        "dengue_data",
        "year,epidemiological_week",
        {"order": "year.desc,epidemiological_week.desc", "limit": "1"},
    )
    if not latest:
        return {"week": "?", "total_cases": 0, "municipios_alerta": 0}
    yw = latest[0]
    year, week = yw["year"], yw["epidemiological_week"]
    rows = postgrest_get(
        "dengue_data",
        "cases,alert_level",
        {"year": f"eq.{year}", "epidemiological_week": f"eq.{week}"},
    )
    total = sum(r.get("cases", 0) or 0 for r in rows)
    alerta = sum(1 for r in rows if (r.get("alert_level") or 0) >= 3)
    return {
        "week": f"SE {week}/{year}",
        "total_cases": total,
        "municipios_alerta": alerta,
        "municipios_total": len(rows),
    }


def fetch_climate_summary():
    """Resumo climatico das ultimas 6h."""
    since = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    rows = postgrest_get(
        "climate_data",
        "temperature,humidity",
        {"observed_at": f"gte.{since}"},
    )
    if not rows:
        return {"stations": 0, "avg_temp": None, "avg_humidity": None}
    temps = [r["temperature"] for r in rows if r.get("temperature") is not None]
    humids = [r["humidity"] for r in rows if r.get("humidity") is not None]
    return {
        "stations": len(rows),
        "avg_temp": round(sum(temps) / len(temps), 1) if temps else None,
        "max_temp": round(max(temps), 1) if temps else None,
        "avg_humidity": round(sum(humids) / len(humids), 1) if humids else None,
    }


def fetch_fire_summary():
    """Focos de incendio nas ultimas 24h."""
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d")
    rows = postgrest_get(
        "fire_spots",
        "municipality",
        {"acq_date": f"gte.{since}"},
    )
    munis = set(r.get("municipality", "") for r in rows)
    return {"total_spots": len(rows), "affected_municipalities": len(munis)}


def fetch_river_summary():
    """Status dos rios monitorados."""
    rows = postgrest_get("river_levels", "municipality,alert_level")
    by_level = {}
    for r in rows:
        level = r.get("alert_level", "normal")
        by_level[level] = by_level.get(level, 0) + 1
    return {"total_stations": len(rows), "by_level": by_level}


# --- Report builder ---

def build_report():
    """Constroi o relatorio situacional completo."""
    now_brt = datetime.now(BRT)
    report_date = now_brt.strftime("%Y-%m-%d")
    print(f"Gerando relatorio situacional para {report_date}...")
    errors = []

    # 1. Fetch all data
    print("  1/6 IRTC scores...")
    try:
        top10 = fetch_irtc_top(10)
        irtc_dist = fetch_irtc_distribution()
    except Exception as e:
        top10, irtc_dist = [], {}
        errors.append(f"irtc: {e}")

    print("  2/6 Alertas ativos...")
    try:
        alert_count, alerts_by_sev = fetch_active_alerts()
    except Exception as e:
        alert_count, alerts_by_sev = 0, {}
        errors.append(f"alerts: {e}")

    print("  3/6 Dengue...")
    try:
        dengue = fetch_dengue_summary()
    except Exception as e:
        dengue = {"week": "?", "total_cases": 0, "municipios_alerta": 0}
        errors.append(f"dengue: {e}")

    print("  4/6 Clima...")
    try:
        clima = fetch_climate_summary()
    except Exception as e:
        clima = {"stations": 0}
        errors.append(f"clima: {e}")

    print("  5/6 Incendios...")
    try:
        fire = fetch_fire_summary()
    except Exception as e:
        fire = {"total_spots": 0, "affected_municipalities": 0}
        errors.append(f"fire: {e}")

    print("  6/6 Rios...")
    try:
        river = fetch_river_summary()
    except Exception as e:
        river = {"total_stations": 0, "by_level": {}}
        errors.append(f"river: {e}")

    # 2. Build executive summary
    alto_critico = irtc_dist.get("alto", 0) + irtc_dist.get("critico", 0)
    summary_parts = [
        f"Relatorio Situacional do Parana - {now_brt.strftime('%d/%m/%Y')}.",
    ]

    if alto_critico > 0:
        summary_parts.append(
            f"{alto_critico} municipio(s) em risco ALTO ou CRITICO."
        )

    if dengue.get("municipios_alerta", 0) > 0:
        summary_parts.append(
            f"Dengue: {dengue['total_cases']} casos na {dengue['week']}, "
            f"{dengue['municipios_alerta']} municipio(s) em alerta laranja/vermelho."
        )
    else:
        summary_parts.append(
            f"Dengue: {dengue.get('total_cases', 0)} casos na {dengue.get('week', '?')}."
        )

    if fire.get("total_spots", 0) > 0:
        summary_parts.append(
            f"Incendios: {fire['total_spots']} foco(s) em "
            f"{fire['affected_municipalities']} municipio(s) nas ultimas 24h."
        )

    if clima.get("max_temp") and clima["max_temp"] > 35:
        summary_parts.append(
            f"Alerta termico: temperatura maxima de {clima['max_temp']}C registrada."
        )

    if alert_count > 0:
        summary_parts.append(f"{alert_count} alerta(s) ativo(s) nas ultimas 24h.")

    executive_summary = " ".join(summary_parts)

    # 3. Build top risks
    top_risks = [
        {
            "municipality": r.get("municipality"),
            "ibge_code": r.get("ibge_code"),
            "irtc_score": r.get("irtc_score"),
            "risk_level": r.get("risk_level"),
            "dominant_domain": r.get("dominant_domain"),
            "data_coverage": r.get("data_coverage"),
        }
        for r in top10
    ]

    # 4. Build domain summaries
    domain_summaries = {
        "dengue": dengue,
        "clima": clima,
        "incendios": fire,
        "rios": river,
        "irtc_distribuicao": irtc_dist,
        "alertas": {"total_24h": alert_count, "por_severidade": alerts_by_sev},
    }

    # 5. Build recommendations
    recs = []
    if alto_critico > 0:
        top_mun = top10[0]["municipality"] if top10 else "?"
        recs.append(
            f"Priorizar monitoramento dos {alto_critico} municipios em risco alto/critico. "
            f"Municipio mais critico: {top_mun}."
        )
    if dengue.get("municipios_alerta", 0) > 5:
        recs.append(
            "Dengue em expansao: acionar protocolo de vigilancia epidemiologica nos "
            f"{dengue['municipios_alerta']} municipios em alerta."
        )
    if fire.get("total_spots", 0) > 10:
        recs.append(
            f"Volume elevado de focos de incendio ({fire['total_spots']}). "
            "Verificar condicoes meteorologicas e acionar Corpo de Bombeiros se necessario."
        )
    river_alert = river.get("by_level", {})
    if river_alert.get("alert", 0) + river_alert.get("emergency", 0) > 0:
        recs.append(
            "Rios em nivel de alerta/emergencia detectados. "
            "Monitorar precipitacao acumulada e acionar Defesa Civil se necessario."
        )
    if not recs:
        recs.append("Situacao geral estavel. Manter monitoramento padrao.")

    recommendations = "\n".join(f"- {r}" for r in recs)

    if errors:
        recommendations += f"\n\n[AVISO: {len(errors)} erro(s) na coleta: {', '.join(errors)}]"

    return {
        "report_date": report_date,
        "executive_summary": executive_summary,
        "active_alerts_count": alert_count,
        "top_risks": top_risks,
        "domain_summaries": domain_summaries,
        "recommendations": recommendations,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    start = datetime.now()
    report = build_report()

    print("\nUpsert no situational_reports...")
    ok = postgrest_upsert("situational_reports", [report], on_conflict="report_date")

    duration = (datetime.now() - start).total_seconds()
    if ok:
        print(f"Relatorio gerado com sucesso em {duration:.1f}s")
        print(f"  Data: {report['report_date']}")
        print(f"  Alertas 24h: {report['active_alerts_count']}")
        print(f"  Top risco: {report['top_risks'][0]['municipality'] if report['top_risks'] else 'N/A'}")
        print(f"  Resumo: {report['executive_summary'][:120]}...")
    else:
        print(f"ERRO ao salvar relatorio (duracao: {duration:.1f}s)")
        sys.exit(1)

    # Health tracking
    health = {
        "cache_key": "etl_health_situational",
        "data": {
            "last_run": datetime.now(timezone.utc).isoformat(),
            "status": "success" if ok else "error",
            "report_date": report["report_date"],
            "duration_seconds": round(duration, 2),
        },
        "source": "etl_situational_report",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    postgrest_upsert("data_cache", [health], on_conflict="cache_key")


if __name__ == "__main__":
    main()
