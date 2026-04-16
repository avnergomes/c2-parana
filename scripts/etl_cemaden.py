#!/usr/bin/env python3
"""ETL CEMADEN: Alertas geo/hidrologicos ativos da Defesa Civil Nacional.

Fase 5.A do plano C4ISR.

Fonte descoberta via inspecao do painelalertas.cemaden.gov.br:
  https://painelalertas.cemaden.gov.br/wsAlertas2
  Retorna {"alertas": [...], "atualizado": "DD-MM-YYYY HH:MM:SS UTC"}

Cada alerta do feed:
  cod_alerta (int)           -> alert_code (string)
  datahoracriacao            -> issued_at (ISO UTC)
  ult_atualizacao
  codibge (int, 7 digits)    -> ibge_code (string)
  evento ("Tipo - Nivel")    -> alert_type + severity
  nivel ("Moderado"/"Alto"/"Muito Alto")
  status (1 = ativo)
  uf, municipio, latitude, longitude

Mapeamento de severidade (nivel oficial CEMADEN -> enum local):
  "Moderado"   -> atencao
  "Alto"       -> alerta
  "Muito Alto" -> alerta_maximo
  (fallback observacao para valores desconhecidos)

Mapeamento de tipo (prefixo do evento -> enum local):
  "Risco Hidrologico"     -> hidrologico
  "Risco Geologico"       -> geologico
  "Movimento de Massa"    -> movimento_massa
  "Alagamento"            -> alagamento
  "Inundacao"             -> inundacao
  "Enxurrada"             -> enxurrada

Integracao com Fase 4: avalia regras ativas domain='cemaden'. Quando a regra
tem auto_create_incident=true e severity >= high, cria um incident no ciclo OODA.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

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

CEMADEN_URL = os.environ.get(
    "CEMADEN_URL",
    "https://painelalertas.cemaden.gov.br/wsAlertas2",
)
CEMADEN_UF = os.environ.get("CEMADEN_UF", "PR")

REQUEST_HEADERS = {
    "User-Agent": (
        "C2Parana-CEMADEN-ETL/1.0 (+https://github.com/avnerpaesgomes/c2-parana)"
    ),
    "Accept": "application/json",
    "Referer": "https://painelalertas.cemaden.gov.br/",
}

MUNICIPIOS_JSON = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "pr_municipios.json",
)


# ─── NORMALIZACAO ────────────────────────────────────────────────────

NIVEL_TO_SEVERITY: dict[str, str] = {
    "observacao": "observacao",
    "observação": "observacao",
    "atencao": "atencao",
    "atenção": "atencao",
    "moderado": "atencao",
    "alerta": "alerta",
    "alto": "alerta",
    "muito alto": "alerta_maximo",
    "alerta maximo": "alerta_maximo",
    "alerta máximo": "alerta_maximo",
}

EVENT_PREFIX_TO_TYPE: list[tuple[str, str]] = [
    ("movimento de massa", "movimento_massa"),
    ("deslizamento", "movimento_massa"),
    ("risco geologico", "geologico"),
    ("risco geológico", "geologico"),
    ("risco hidrologico", "hidrologico"),
    ("risco hidrológico", "hidrologico"),
    ("meteorologico", "meteorologico"),
    ("meteorológico", "meteorologico"),
    ("alagamento", "alagamento"),
    ("inundacao", "inundacao"),
    ("inundação", "inundacao"),
    ("enxurrada", "enxurrada"),
    ("erosao", "erosao"),
    ("erosão", "erosao"),
]


def strip_accents_lower(text: str) -> str:
    """Normaliza: lowercase + remove acentos comuns (copia do etl_irtc)."""
    return (
        text.lower()
        .strip()
        .replace("á", "a").replace("ã", "a").replace("â", "a").replace("à", "a")
        .replace("é", "e").replace("ê", "e")
        .replace("í", "i").replace("î", "i")
        .replace("ó", "o").replace("ô", "o").replace("õ", "o")
        .replace("ú", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c")
    )


def map_severity(nivel: str | None) -> str:
    if not nivel:
        return "observacao"
    key = nivel.lower().strip()
    if key in NIVEL_TO_SEVERITY:
        return NIVEL_TO_SEVERITY[key]
    return NIVEL_TO_SEVERITY.get(strip_accents_lower(nivel), "observacao")


def map_alert_type(evento: str | None) -> str:
    if not evento:
        return "outro"
    simple = strip_accents_lower(evento)
    for prefix, mapped in EVENT_PREFIX_TO_TYPE:
        if prefix in simple:
            return mapped
    return "outro"


# ─── MUNICIPIOS LOOKUP ───────────────────────────────────────────────

def load_name_lookup() -> dict[str, str]:
    with open(MUNICIPIOS_JSON, "r", encoding="utf-8") as fp:
        entries = json.load(fp)
    lookup: dict[str, str] = {}
    for entry in entries:
        name = entry.get("name", "")
        ibge = entry.get("ibge")
        if not (name and ibge):
            continue
        lookup[strip_accents_lower(name)] = ibge
        lookup[name.lower().strip()] = ibge
    return lookup


def match_ibge(
    codibge_raw: int | str | None,
    municipality: str | None,
    name_lookup: dict[str, str],
) -> str | None:
    """Prefere o codibge do feed (autoritativo); cai para lookup por nome."""
    if codibge_raw:
        code = str(codibge_raw).strip()
        if code and code.isdigit():
            return code
    if not municipality:
        return None
    simple = strip_accents_lower(municipality)
    return name_lookup.get(simple) or name_lookup.get(municipality.lower().strip())


# ─── HTTP RETRY ──────────────────────────────────────────────────────

def fetch_with_retry(
    url: str,
    max_retries: int = 3,
    timeout: int = 30,
    params: dict[str, Any] | None = None,
) -> requests.Response | None:
    base_delay = 1.0
    for attempt in range(max_retries):
        try:
            resp = requests.get(
                url,
                headers=REQUEST_HEADERS,
                params=params,
                timeout=timeout,
            )
            # Forca UTF-8 (o feed vem com charset latin1/utf8 misturado)
            resp.encoding = "utf-8"
            if resp.status_code < 500 and resp.status_code != 429:
                return resp
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(
                    f"    HTTP {resp.status_code}, retry em {delay:.1f}s "
                    f"(tentativa {attempt + 1}/{max_retries})"
                )
                time.sleep(delay)
        except (requests.Timeout, requests.ConnectionError) as err:
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"    conexao falhou: {err}, retry em {delay:.1f}s")
                time.sleep(delay)
            else:
                print(f"    falha de conexao apos {max_retries} tentativas: {err}")
                return None
    return None


# ─── PARSE DO FEED ───────────────────────────────────────────────────

@dataclass(frozen=True)
class CemadenAlert:
    alert_code: str
    uf: str
    municipality: str
    ibge_code: str | None
    alert_type: str
    severity: str
    description: str | None
    geometry_geojson: dict[str, Any] | None
    issued_at: str          # ISO 8601 UTC
    expires_at: str | None
    source_url: str | None
    raw_payload: dict[str, Any]


def parse_cemaden_datetime(raw: str | None) -> str | None:
    """Feed entrega 'YYYY-MM-DD HH:MM:SS.mmm' sem TZ; assumimos UTC."""
    if not raw:
        return None
    txt = raw.strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ):
        try:
            dt = datetime.strptime(txt, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def build_alert(raw: dict[str, Any], name_lookup: dict[str, str]) -> CemadenAlert | None:
    cod = raw.get("cod_alerta")
    if cod is None:
        return None
    alert_code = str(cod).strip()

    issued_at = parse_cemaden_datetime(raw.get("datahoracriacao"))
    if issued_at is None:
        issued_at = parse_cemaden_datetime(raw.get("ult_atualizacao"))
    if issued_at is None:
        return None

    uf = str(raw.get("uf") or "").strip().upper()
    municipality = str(raw.get("municipio") or "").strip().title()

    lat = raw.get("latitude")
    lon = raw.get("longitude")
    geometry = None
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        geometry = {"type": "Point", "coordinates": [float(lon), float(lat)]}

    return CemadenAlert(
        alert_code=alert_code,
        uf=uf or CEMADEN_UF,
        municipality=municipality,
        ibge_code=match_ibge(raw.get("codibge"), municipality, name_lookup),
        alert_type=map_alert_type(raw.get("evento")),
        severity=map_severity(raw.get("nivel")),
        description=raw.get("evento"),
        geometry_geojson=geometry,
        issued_at=issued_at,
        expires_at=None,
        source_url="https://painelalertas.cemaden.gov.br/",
        raw_payload=raw,
    )


def iter_raw_alerts(payload: Any) -> Iterable[dict[str, Any]]:
    if isinstance(payload, dict):
        items = payload.get("alertas")
        if isinstance(items, list):
            yield from items


# ─── SUPABASE I/O ────────────────────────────────────────────────────

def postgrest_upsert(table: str, records: list[dict[str, Any]], on_conflict: str) -> bool:
    if not records:
        return True
    headers = {**HEADERS, "Prefer": "resolution=merge-duplicates"}
    for i in range(0, len(records), 200):
        batch = records[i : i + 200]
        url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
        resp = requests.post(url, headers=headers, json=batch, timeout=30)
        if resp.status_code not in (200, 201):
            print(
                f"  ERRO upsert {table} lote {i}: HTTP {resp.status_code} "
                f"- {resp.text[:300]}"
            )
            return False
    return True


def fetch_active_alert_rules(domain: str = "cemaden") -> list[dict[str, Any]]:
    url = (
        f"{SUPABASE_URL}/rest/v1/alert_rules"
        f"?select=*&is_active=eq.true&domain=eq.{domain}"
    )
    resp = requests.get(url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        print(f"  WARN fetch alert_rules HTTP {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json()


def rule_matches(rule: dict[str, Any], alert: CemadenAlert) -> bool:
    condition = rule.get("condition") or {}
    if condition.get("type") != "simple":
        return False
    field = condition.get("field")
    op = condition.get("op")
    target = condition.get("value")
    current = getattr(alert, field, None) if field else None
    if op == "=":
        return current == target
    if op == "!=":
        return current != target
    if op in (">", ">=", "<", "<="):
        try:
            lhs = float(current)  # type: ignore[arg-type]
            rhs = float(target)
        except (TypeError, ValueError):
            return False
        return {
            ">": lhs > rhs,
            ">=": lhs >= rhs,
            "<": lhs < rhs,
            "<=": lhs <= rhs,
        }[op]
    return False


def cooldown_recent(rule_id: str, alert: CemadenAlert, cooldown_minutes: int) -> bool:
    since = (
        datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)
    ).isoformat()
    ibge = alert.ibge_code or ""
    url = (
        f"{SUPABASE_URL}/rest/v1/notifications"
        f"?select=id&rule_id=eq.{rule_id}"
        f"&sent_at=gte.{since}"
        f"&metadata->>ibge_code=eq.{ibge}"
    )
    resp = requests.get(url, headers=HEADERS, timeout=10)
    if resp.status_code != 200:
        return False
    return len(resp.json()) > 0


def insert_notification(rule: dict[str, Any], alert: CemadenAlert) -> str | None:
    payload = {
        "rule_id": rule["id"],
        "user_id": None,
        "channel": "push",
        "title": f"[CEMADEN] {rule['name']} — {alert.municipality}",
        "body": alert.description or (
            f"Alerta {alert.severity} ({alert.alert_type}) emitido em "
            f"{alert.issued_at} para {alert.municipality}."
        ),
        "severity": rule["severity"],
        "metadata": {
            "source": "cemaden",
            "alert_code": alert.alert_code,
            "alert_type": alert.alert_type,
            "municipality": alert.municipality,
            "ibge_code": alert.ibge_code,
            "issued_at": alert.issued_at,
        },
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/notifications",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=payload,
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        print(
            f"    WARN insert notification HTTP {resp.status_code}: "
            f"{resp.text[:200]}"
        )
        return None
    data = resp.json()
    return data[0]["id"] if isinstance(data, list) and data else None


def insert_incident(
    rule: dict[str, Any],
    alert: CemadenAlert,
    notification_id: str | None,
) -> bool:
    incident_type = {
        "geologico": "deslizamento",
        "movimento_massa": "deslizamento",
        "hidrologico": "enchente",
        "alagamento": "enchente",
        "inundacao": "enchente",
        "enxurrada": "enchente",
        "meteorologico": "outro",
        "erosao": "outro",
    }.get(alert.alert_type, "outro")

    payload = {
        "title": f"CEMADEN {alert.severity.replace('_', ' ')} — {alert.municipality}",
        "description": alert.description
            or f"Alerta CEMADEN ({alert.alert_type}) em {alert.municipality}",
        "type": incident_type,
        "severity": rule["severity"],
        "status": "detected",
        "affected_municipalities": [
            {"ibge_code": alert.ibge_code, "name": alert.municipality}
        ],
        "source_alert_id": rule["id"],
        "source_notification_id": notification_id,
        "context": {
            "source": "cemaden",
            "alert_code": alert.alert_code,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "issued_at": alert.issued_at,
            "geometry": alert.geometry_geojson,
        },
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/incidents",
        headers=HEADERS,
        json=payload,
        timeout=15,
    )
    ok = resp.status_code in (200, 201)
    if not ok:
        print(f"    WARN insert incident HTTP {resp.status_code}: {resp.text[:300]}")
    return ok


# ─── MAIN ────────────────────────────────────────────────────────────

def main() -> int:
    start = datetime.now(timezone.utc)
    print("=" * 60)
    print("ETL CEMADEN — alertas geo/hidrologicos")
    print(f"UF alvo: {CEMADEN_UF} | endpoint: {CEMADEN_URL}")
    print("=" * 60)

    name_lookup = load_name_lookup()
    print(f"\n[1/4] {len(name_lookup) // 2} municipios carregados para lookup")

    print("\n[2/4] Consultando feed CEMADEN...")
    resp = fetch_with_retry(CEMADEN_URL, timeout=30)
    if resp is None or resp.status_code >= 400:
        status = resp.status_code if resp else "conn_error"
        print(f"  falha ao consultar CEMADEN (HTTP {status})")
        return 1

    try:
        payload = resp.json()
    except ValueError:
        print(f"  resposta nao JSON (HTTP {resp.status_code}): {resp.text[:200]}")
        return 2

    all_raw = list(iter_raw_alerts(payload))
    print(
        f"  feed retornou {len(all_raw)} alertas globais "
        f"(atualizado={payload.get('atualizado')})"
    )

    # Filtrar por UF alvo
    raw_uf = [a for a in all_raw if str(a.get("uf", "")).strip().upper() == CEMADEN_UF]
    print(f"  {len(raw_uf)} alertas em {CEMADEN_UF}")

    alerts: list[CemadenAlert] = []
    for item in raw_uf:
        alert = build_alert(item, name_lookup)
        if alert:
            alerts.append(alert)
    missed = len(raw_uf) - len(alerts)
    if missed:
        print(f"  {missed} descartados por dados incompletos")

    # 3. Upsert
    print("\n[3/4] Persistindo em cemaden_alerts...")
    records = [
        {
            "alert_code": a.alert_code,
            "uf": a.uf,
            "municipality": a.municipality,
            "ibge_code": a.ibge_code,
            "alert_type": a.alert_type,
            "severity": a.severity,
            "description": a.description,
            "geometry_geojson": a.geometry_geojson,
            "issued_at": a.issued_at,
            "expires_at": a.expires_at,
            "source_url": a.source_url,
            "raw_payload": a.raw_payload,
            "ingested_at": start.isoformat(),
        }
        for a in alerts
    ]
    ok = postgrest_upsert(
        "cemaden_alerts",
        records,
        on_conflict="alert_code,issued_at",
    )
    if not ok:
        return 3
    print(f"  upserted {len(records)} alertas")

    # 4. Avaliar regras cemaden
    print("\n[4/4] Avaliando regras...")
    rules = fetch_active_alert_rules("cemaden")
    print(f"  {len(rules)} regras ativas")

    fired = 0
    incidents_created = 0
    for alert in alerts:
        for rule in rules:
            if not rule_matches(rule, alert):
                continue
            cooldown = int(rule.get("cooldown_minutes") or 60)
            if cooldown_recent(rule["id"], alert, cooldown):
                continue
            notif_id = insert_notification(rule, alert)
            fired += 1
            if rule.get("auto_create_incident"):
                if insert_incident(rule, alert, notif_id):
                    incidents_created += 1
    print(f"  notifications={fired}, incidents={incidents_created}")

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\nDONE em {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
