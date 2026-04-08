#!/usr/bin/env python3
"""ETL Correlations: motor de fusao de dados multi-dominio (Fase 3.A).

Avalia regras compostas (domain='composto') lidas de alert_rules, cruzando
dados de climate_data, fire_spots, river_levels, dengue_data, air_quality e
irtc_scores. Quando uma regra dispara para um municipio, gera um fan-out de
notifications (uma por usuario em auth.users) para que todos os operadores
recebam o alerta.

Reusa intencionalmente os padroes de etl_irtc.py (postgrest_get,
postgrest_upsert, carregamento de municipios via GeoJSON, matching por nome)
para manter consistencia de codigo e facilitar manutencao.

Cooldown: antes de inserir uma nova notification, checa se ja existe uma
notification dessa mesma regra+municipio dentro do window de cooldown_minutes
da regra, e pula se sim. Isso evita spam enquanto a condicao persiste.
"""

import os
import json
import sys
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from typing import Any

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

GEOJSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data", "municipios-pr.geojson",
)


# --- HTTP helpers ---------------------------------------------------------

def postgrest_get(table: str, select: str = "*", params: dict | None = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"  WARN: GET {table} -> HTTP {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json()


def postgrest_post(table: str, records: list, prefer: str = "return=minimal") -> bool:
    if not records:
        return True
    post_headers = {**HEADERS, "Prefer": prefer}
    for i in range(0, len(records), 200):
        batch = records[i:i + 200]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        resp = requests.post(url, headers=post_headers, json=batch, timeout=30)
        if resp.status_code not in (200, 201, 204):
            print(f"  ERRO POST {table} lote {i}: HTTP {resp.status_code} - {resp.text[:300]}")
            return False
    return True


# --- Data loaders ---------------------------------------------------------

def load_composite_rules() -> list[dict]:
    """Le regras compostas ativas de alert_rules."""
    rules = postgrest_get(
        "alert_rules",
        select="id,name,description,severity,condition,cooldown_minutes",
        params={"domain": "eq.composto", "is_active": "eq.true"},
    )
    print(f"  {len(rules)} regras compostas ativas carregadas")
    return rules


def load_users() -> list[str]:
    """Lista ids de usuarios ativos (para fan-out de notifications).

    auth.users nao e acessivel via PostgREST public schema; usamos uma RPC
    ou fallback para profiles que espelha auth.users.
    """
    users = postgrest_get("profiles", select="id", params={"limit": "1000"})
    ids = [u["id"] for u in users if u.get("id")]
    print(f"  {len(ids)} usuarios carregados para fan-out")
    return ids


def load_municipalities() -> dict[str, str]:
    """Carrega ibge_code -> nome do GeoJSON local."""
    try:
        with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
            geojson = json.load(f)
        municipalities = {}
        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            ibge_code = props.get("CD_MUN") or props.get("codarea")
            name = props.get("NM_MUN", "")
            if ibge_code and name:
                municipalities[str(ibge_code)] = name
        return municipalities
    except Exception as e:
        print(f"  ERRO ao carregar GeoJSON: {e}")
        return {}


def fetch_recent_climate(window_hours: int) -> dict[str, dict]:
    """Retorna climate_data agregado por ibge_code com max temp e min humidity
    na janela temporal."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).isoformat()
    records = postgrest_get(
        "climate_data",
        select="ibge_code,temperature,humidity,observed_at",
        params={"observed_at": f"gte.{cutoff}", "order": "observed_at.desc", "limit": "5000"},
    )
    agg: dict[str, dict] = {}
    for r in records:
        ibge = r.get("ibge_code")
        if not ibge:
            continue
        cur = agg.setdefault(ibge, {"max_temp": None, "min_humidity": None})
        t = r.get("temperature")
        h = r.get("humidity")
        if t is not None and (cur["max_temp"] is None or t > cur["max_temp"]):
            cur["max_temp"] = t
        if h is not None and (cur["min_humidity"] is None or h < cur["min_humidity"]):
            cur["min_humidity"] = h
    return agg


def fetch_recent_fire_counts(window_hours: int, name_lookup: dict[str, str]) -> dict[str, int]:
    """Retorna contagem de focos por ibge_code nas ultimas N horas.

    fire_spots.municipality e texto livre — usa name_lookup para resolver.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=window_hours)).date().isoformat()
    records = postgrest_get(
        "fire_spots",
        select="municipality,acq_date",
        params={"acq_date": f"gte.{cutoff}"},
    )
    counts: dict[str, int] = defaultdict(int)
    unmatched = 0
    for r in records:
        mun = r.get("municipality")
        if not mun:
            continue
        ibge = match_name_to_ibge(mun, name_lookup)
        if ibge:
            counts[ibge] += 1
        else:
            unmatched += 1
    if unmatched:
        print(f"  (fire_spots: {unmatched} focos com municipio nao reconciliado)")
    return dict(counts)


def fetch_river_alerts(name_lookup: dict[str, str]) -> dict[str, str]:
    """Retorna pior alert_level por ibge_code."""
    records = postgrest_get("river_levels", select="municipality,alert_level")
    priority = {"normal": 0, "attention": 1, "alert": 2, "emergency": 3}
    by_ibge: dict[str, str] = {}
    for r in records:
        mun = r.get("municipality")
        level = r.get("alert_level") or "normal"
        if not mun:
            continue
        ibge = match_name_to_ibge(mun, name_lookup)
        if not ibge:
            continue
        current = by_ibge.get(ibge, "normal")
        if priority.get(level, 0) > priority.get(current, 0):
            by_ibge[ibge] = level
    return by_ibge


def fetch_dengue_latest() -> dict[str, int]:
    """Retorna ultimo alert_level de dengue por ibge_code."""
    records = postgrest_get(
        "dengue_data",
        select="ibge_code,alert_level,year,epidemiological_week",
        params={"order": "year.desc,epidemiological_week.desc", "limit": "2000"},
    )
    by_ibge: dict[str, int] = {}
    for r in records:
        ibge = r.get("ibge_code")
        if ibge and ibge not in by_ibge:
            by_ibge[ibge] = int(r.get("alert_level") or 0)
    return by_ibge


def fetch_irtc_scores() -> dict[str, float]:
    records = postgrest_get("irtc_scores", select="ibge_code,irtc_score")
    return {r["ibge_code"]: float(r.get("irtc_score") or 0) for r in records if r.get("ibge_code")}


def fetch_air_quality_by_ibge() -> dict[str, int]:
    """Retorna AQI por ibge_code. air_quality tem city — reusa o mesmo mapping
    manual do etl_irtc.py para as 4 capitais principais com AQICN."""
    records = postgrest_get("air_quality", select="city,aqi")
    city_to_ibge = {
        "curitiba": "4106902",
        "londrina": "4113700",
        "maringa": "4115200",
        "foz": "4108304",
    }
    by_ibge: dict[str, int] = {}
    for r in records:
        city = (r.get("city") or "").lower()
        ibge = city_to_ibge.get(city)
        aqi = r.get("aqi")
        if ibge and aqi is not None:
            by_ibge[ibge] = int(aqi)
    return by_ibge


# --- Name matching (reusa logica do etl_irtc.py) --------------------------

def _simplify(name: str) -> str:
    return (
        name.lower().strip()
        .replace("á", "a").replace("ã", "a").replace("â", "a").replace("à", "a")
        .replace("é", "e").replace("ê", "e")
        .replace("í", "i").replace("î", "i")
        .replace("ó", "o").replace("ô", "o").replace("õ", "o")
        .replace("ú", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c")
    )


def build_name_lookup(municipalities: dict[str, str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for ibge_code, name in municipalities.items():
        lookup[name.lower().strip()] = ibge_code
        lookup[_simplify(name)] = ibge_code
    return lookup


def match_name_to_ibge(name: str, lookup: dict[str, str]) -> str | None:
    if not name:
        return None
    return lookup.get(name.lower().strip()) or lookup.get(_simplify(name))


# --- Rule evaluation ------------------------------------------------------

def eval_clause(clause: dict, ctx: dict) -> bool:
    """Avalia uma clausula unica contra o contexto de um municipio."""
    field = clause.get("field", "")
    op = clause.get("op", "=")
    value = clause.get("value")

    actual = _resolve_field(field, ctx)
    if actual is None:
        return False

    if op == ">":
        return actual > value
    if op == ">=":
        return actual >= value
    if op == "<":
        return actual < value
    if op == "<=":
        return actual <= value
    if op == "=":
        return actual == value
    if op == "!=":
        return actual != value
    if op == "in":
        return actual in value
    return False


def _resolve_field(field: str, ctx: dict) -> Any:
    """Resolve 'climate.temperature' para ctx['climate']['max_temp'] etc."""
    if field == "climate.temperature":
        return (ctx.get("climate") or {}).get("max_temp")
    if field == "climate.humidity":
        return (ctx.get("climate") or {}).get("min_humidity")
    if field == "fire_spots.count":
        return ctx.get("fire_count", 0)
    if field == "river.alert_level":
        return ctx.get("river_level", "normal")
    if field == "dengue.alert_level":
        return ctx.get("dengue_level", 0)
    if field == "irtc.score":
        return ctx.get("irtc_score", 0)
    if field == "air.aqi":
        return ctx.get("aqi")
    return None


def eval_rule(rule: dict, ctx: dict) -> bool:
    condition = rule.get("condition") or {}
    if condition.get("type") != "composite":
        return False
    logic = condition.get("logic", "AND")
    clauses = condition.get("clauses", [])
    if not clauses:
        return False
    results = [eval_clause(c, ctx) for c in clauses]
    return all(results) if logic == "AND" else any(results)


# --- Cooldown check -------------------------------------------------------

def recently_fired(rule_id: str, ibge_code: str, cooldown_minutes: int) -> bool:
    """Retorna True se ja existe uma notification dessa regra+municipio
    dentro do window de cooldown."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)).isoformat()
    records = postgrest_get(
        "notifications",
        select="id",
        params={
            "rule_id": f"eq.{rule_id}",
            "metadata->>ibge_code": f"eq.{ibge_code}",
            "sent_at": f"gte.{cutoff}",
            "limit": "1",
        },
    )
    return len(records) > 0


# --- Fan-out --------------------------------------------------------------

def build_notification(rule: dict, mun_name: str, ibge_code: str, user_id: str, ctx: dict) -> dict:
    return {
        "rule_id": rule["id"],
        "user_id": user_id,
        "channel": "push",
        "title": f"{rule['name']} — {mun_name}",
        "body": _build_body(rule, mun_name, ctx),
        "severity": rule["severity"],
        "metadata": {
            "domain": "composto",
            "ibge_code": ibge_code,
            "municipality": mun_name,
            "source": "etl_correlations",
            "rule_name": rule["name"],
            "context_snapshot": {
                k: v for k, v in ctx.items() if k in {"fire_count", "river_level", "dengue_level", "irtc_score", "aqi"}
            },
        },
    }


def _build_body(rule: dict, mun_name: str, ctx: dict) -> str:
    parts = []
    climate = ctx.get("climate") or {}
    if climate.get("max_temp") is not None:
        parts.append(f"Temp max: {climate['max_temp']:.1f}°C")
    if climate.get("min_humidity") is not None:
        parts.append(f"Umidade min: {climate['min_humidity']:.0f}%")
    if ctx.get("fire_count", 0) > 0:
        parts.append(f"Focos 24h: {ctx['fire_count']}")
    if ctx.get("river_level") and ctx["river_level"] != "normal":
        parts.append(f"Rio: {ctx['river_level']}")
    if ctx.get("dengue_level", 0) > 0:
        parts.append(f"Dengue nivel: {ctx['dengue_level']}")
    if ctx.get("irtc_score", 0) > 0:
        parts.append(f"IRTC: {ctx['irtc_score']:.1f}")
    if ctx.get("aqi") is not None:
        parts.append(f"AQI: {ctx['aqi']}")
    details = " | ".join(parts) if parts else ""
    return f"Correlacao detectada em {mun_name}. {details}".strip()


# --- Main -----------------------------------------------------------------

def main() -> None:
    start = datetime.now(timezone.utc)
    print("=" * 60)
    print("ETL Correlations — Fase 3.A (fusao multi-dominio)")
    print("=" * 60)

    print("\n1/6 Carregando regras compostas...")
    rules = load_composite_rules()
    if not rules:
        print("  Nenhuma regra composta ativa. Saindo.")
        return

    print("\n2/6 Carregando municipios e usuarios...")
    municipalities = load_municipalities()
    if not municipalities:
        print("  ERRO FATAL: GeoJSON de municipios nao carregado.")
        return
    name_lookup = build_name_lookup(municipalities)
    user_ids = load_users()
    if not user_ids:
        print("  AVISO: nenhum usuario encontrado — fan-out sera vazio.")

    print("\n3/6 Buscando dados de clima (janela 6h)...")
    climate_agg = fetch_recent_climate(window_hours=6)
    print(f"  {len(climate_agg)} municipios com clima recente")

    print("\n4/6 Buscando focos, rios, dengue, ar, IRTC...")
    fire_counts = fetch_recent_fire_counts(window_hours=24, name_lookup=name_lookup)
    river_alerts = fetch_river_alerts(name_lookup)
    dengue_levels = fetch_dengue_latest()
    irtc_scores = fetch_irtc_scores()
    air_by_ibge = fetch_air_quality_by_ibge()
    print(f"  focos={len(fire_counts)} rios={len(river_alerts)} dengue={len(dengue_levels)} "
          f"irtc={len(irtc_scores)} ar={len(air_by_ibge)}")

    print("\n5/6 Avaliando regras por municipio...")
    notifications_to_insert: list[dict] = []
    fired_count = 0
    cooldown_skip_count = 0

    for ibge_code, mun_name in municipalities.items():
        ctx = {
            "climate": climate_agg.get(ibge_code),
            "fire_count": fire_counts.get(ibge_code, 0),
            "river_level": river_alerts.get(ibge_code, "normal"),
            "dengue_level": dengue_levels.get(ibge_code, 0),
            "irtc_score": irtc_scores.get(ibge_code, 0),
            "aqi": air_by_ibge.get(ibge_code),
        }

        for rule in rules:
            if not eval_rule(rule, ctx):
                continue

            cooldown = int(rule.get("cooldown_minutes") or 60)
            if recently_fired(rule["id"], ibge_code, cooldown):
                cooldown_skip_count += 1
                continue

            fired_count += 1
            for uid in user_ids:
                notifications_to_insert.append(
                    build_notification(rule, mun_name, ibge_code, uid, ctx)
                )

    print(f"  {fired_count} disparos de regras, {cooldown_skip_count} pulados por cooldown")
    print(f"  {len(notifications_to_insert)} notifications a inserir (com fan-out)")

    print("\n6/6 Inserindo notifications no Supabase...")
    if notifications_to_insert:
        ok = postgrest_post("notifications", notifications_to_insert)
        if ok:
            print(f"  {len(notifications_to_insert)} notifications inseridas")
        else:
            print("  ERRO no insert de notifications")
    else:
        print("  Nada a inserir — ambiente calmo ou cooldowns ativos")

    # Health tracking
    duration = (datetime.now(timezone.utc) - start).total_seconds()
    status = "success" if notifications_to_insert or fired_count == 0 else "partial"
    health_record = {
        "cache_key": "etl_health_correlations",
        "data": {
            "last_run": start.isoformat(),
            "status": status,
            "rules_active": len(rules),
            "municipalities_evaluated": len(municipalities),
            "rules_fired": fired_count,
            "cooldown_skipped": cooldown_skip_count,
            "notifications_inserted": len(notifications_to_insert),
            "duration_seconds": round(duration, 2),
        },
        "source": "etl_correlations",
        "fetched_at": start.isoformat(),
    }
    postgrest_post("data_cache", [health_record], prefer="resolution=merge-duplicates,return=minimal")

    print("\n" + "=" * 60)
    print(f"ETL Correlations concluido em {duration:.1f}s  status={status}")
    print(f"Regras ativas:   {len(rules)}")
    print(f"Disparos:        {fired_count}")
    print(f"Cooldowns:       {cooldown_skip_count}")
    print(f"Notifications:   {len(notifications_to_insert)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
