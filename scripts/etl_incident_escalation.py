#!/usr/bin/env python3
"""ETL Incident Escalation: escalonamento automatico por SLA (Fase 4.E).

Roda a cada 15 minutos via cron-escalation.yml. Identifica incidentes nao
atendidos que ultrapassaram o SLA da sua severidade e:

  1. Registra uma acao 'escalation' em incident_actions (audit trail)
  2. Cria notifications para usuarios com role >= escalate_to_role
  3. Incrementa incidents.escalation_count e atualiza last_escalated_at

Regras de SLA vem de escalation_rules (seed na migration 024):
  critical:  15 min -> commander (push + email)
  high:      60 min -> commander (push + email)
  medium:   240 min -> operator (push)
  low:     1440 min -> operator (email)

SLA adaptativo: a cada escalation, o threshold dobra, para evitar spam.
Apos 3 escalations sem atendimento, o sistema para de escalar silenciosamente.
"""

import os
import sys
import time
import json
import requests
from datetime import datetime, timezone, timedelta
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

MAX_ESCALATIONS = 3  # apos isso, para de escalar

SEVERITY_LABELS = {
    "critical": "Critico",
    "high": "Alto",
    "medium": "Medio",
    "low": "Baixo",
}


# --- HTTP helpers ---------------------------------------------------------

def pg_get(table: str, params: dict | None = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        print(f"  WARN GET {table}: HTTP {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  ERROR GET {table}: {e}")
    return []


def pg_post(
    table: str,
    data: list | dict,
    prefer: str = "return=minimal",
    on_conflict: str | None = None,
) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    try:
        resp = requests.post(
            url,
            headers={**HEADERS, "Prefer": prefer},
            json=data,
            timeout=30,
        )
        if resp.status_code in (200, 201, 204):
            return True
        print(f"  WARN POST {table}: HTTP {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  ERROR POST {table}: {e}")
    return False


def pg_patch(table: str, filter_param: str, data: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filter_param}"
    try:
        resp = requests.patch(
            url,
            headers={**HEADERS, "Prefer": "return=minimal"},
            json=data,
            timeout=30,
        )
        if resp.status_code in (200, 204):
            return True
        print(f"  WARN PATCH {table}: HTTP {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  ERROR PATCH {table}: {e}")
    return False


# --- Core logic -----------------------------------------------------------

def load_escalation_rules() -> dict[str, dict]:
    """Retorna mapping severity -> rule dict."""
    rules = pg_get("escalation_rules", {
        "select": "*",
        "is_active": "eq.true",
    })
    return {r["severity"]: r for r in rules}


def load_pending_incidents() -> list[dict]:
    """Incidentes nao atendidos (status=detected/observing, sem acknowledged_at)
    OU incidentes ativos com atendimento parado ha muito tempo."""
    # Busca todos os incidentes ativos (nao resolvidos/fechados)
    return pg_get("incidents", {
        "select": (
            "id,title,type,severity,status,detected_at,acknowledged_at,"
            "assigned_to,escalation_count,last_escalated_at"
        ),
        "status": "not.in.(resolved,closed)",
        "order": "severity,detected_at.asc",
    })


def load_commanders_and_operators() -> tuple[list[str], list[str]]:
    """Retorna (commander_ids, operator_ids) de profiles."""
    profiles = pg_get("profiles", {"select": "id,role"})
    commanders = [p["id"] for p in profiles if p.get("role") == "commander"]
    operators = [p["id"] for p in profiles if p.get("role") in ("commander", "operator")]
    return commanders, operators


def should_escalate(incident: dict, rule: dict, now: datetime) -> bool:
    """Determina se um incidente deve ser escalado agora.

    Logica:
      - Se nao foi atendido (acknowledged_at is null) E nao ultrapassou 3 escalations
      - Tempo decorrido desde detected_at (ou last_escalated_at se ja escalou)
        supera rule.max_response_minutes * (2 ** escalation_count)
    """
    if incident.get("acknowledged_at"):
        return False

    escalation_count = incident.get("escalation_count", 0) or 0
    if escalation_count >= MAX_ESCALATIONS:
        return False

    base_minutes = rule["max_response_minutes"]
    threshold_minutes = base_minutes * (2 ** escalation_count)

    # Ponto de referencia: ultima escalation ou deteccao
    last_ref = incident.get("last_escalated_at") or incident["detected_at"]
    last_ref_dt = datetime.fromisoformat(last_ref.replace("Z", "+00:00"))
    elapsed_min = (now - last_ref_dt).total_seconds() / 60

    return elapsed_min >= threshold_minutes


def escalate_incident(
    incident: dict,
    rule: dict,
    commanders: list[str],
    operators: list[str],
    now: datetime,
) -> bool:
    """Executa a escalation: registra action + cria notifications + atualiza incidente."""
    incident_id = incident["id"]
    new_count = (incident.get("escalation_count", 0) or 0) + 1

    # Determina destinatarios baseado em escalate_to_role
    role = rule.get("escalate_to_role", "commander")
    recipients = commanders if role == "commander" else operators

    elapsed_min = int(
        (now - datetime.fromisoformat(incident["detected_at"].replace("Z", "+00:00")))
        .total_seconds() / 60
    )

    description = (
        f"Escalation #{new_count}: incidente sem atendimento ha {elapsed_min} min. "
        f"Severidade {SEVERITY_LABELS.get(incident['severity'], incident['severity'])} "
        f"escalada para role={role}."
    )

    # 1. Registrar action no audit trail
    action_ok = pg_post("incident_actions", {
        "incident_id": incident_id,
        "action_type": "escalation",
        "description": description,
        "old_value": str(new_count - 1),
        "new_value": str(new_count),
        "metadata": {
            "rule_id": rule["id"],
            "role": role,
            "channels": rule.get("channels", []),
            "elapsed_minutes": elapsed_min,
            "recipients_count": len(recipients),
        },
    })
    if not action_ok:
        return False

    # 2. Criar notifications para cada recipient em cada canal
    channels = rule.get("channels") or ["push"]
    notifications = []
    for user_id in recipients:
        for channel in channels:
            notifications.append({
                "user_id": user_id,
                "channel": channel,
                "title": f"Escalation: {incident['title']}",
                "body": description,
                "severity": incident["severity"],
                "metadata": {
                    "domain": "incident_escalation",
                    "incident_id": incident_id,
                    "escalation_count": new_count,
                    "source": "etl_incident_escalation",
                },
            })

    if notifications:
        pg_post("notifications", notifications)

    # 3. Atualizar incidente (incrementa count + timestamp)
    pg_patch(
        "incidents",
        f"id=eq.{incident_id}",
        {
            "escalation_count": new_count,
            "last_escalated_at": now.isoformat(),
        },
    )

    print(f"  Escalated {incident_id[:8]} '{incident['title'][:40]}' "
          f"(count={new_count}, recipients={len(recipients)})")
    return True


# --- Main -----------------------------------------------------------------

def main() -> None:
    start = time.time()
    now = datetime.now(timezone.utc)
    print("=" * 60)
    print(f"ETL Incident Escalation — {now.isoformat()}")
    print("=" * 60)

    print("\n1/4 Carregando regras de escalation...")
    rules = load_escalation_rules()
    if not rules:
        print("  ERRO: nenhuma regra ativa em escalation_rules. Aplicar migration 024.")
        return
    print(f"  {len(rules)} regras carregadas: {list(rules.keys())}")

    print("\n2/4 Carregando incidentes pendentes...")
    incidents = load_pending_incidents()
    print(f"  {len(incidents)} incidentes ativos")
    if not incidents:
        _save_health(start, rules, 0, 0, 0)
        print("\nNada a escalar. Saindo.")
        return

    print("\n3/4 Carregando usuarios por role...")
    commanders, operators = load_commanders_and_operators()
    print(f"  commanders={len(commanders)} operators={len(operators)}")

    print("\n4/4 Avaliando escalations...")
    escalated = 0
    skipped_no_rule = 0
    skipped_not_due = 0

    for incident in incidents:
        rule = rules.get(incident["severity"])
        if not rule:
            skipped_no_rule += 1
            continue

        if not should_escalate(incident, rule, now):
            skipped_not_due += 1
            continue

        if escalate_incident(incident, rule, commanders, operators, now):
            escalated += 1

    duration = time.time() - start
    print(f"\n  Escaladas:        {escalated}")
    print(f"  Sem regra:        {skipped_no_rule}")
    print(f"  Ainda no SLA:     {skipped_not_due}")

    _save_health(start, rules, escalated, skipped_not_due, skipped_no_rule)

    print("\n" + "=" * 60)
    print(f"ETL Escalation concluido em {duration:.1f}s")
    print("=" * 60)


def _save_health(
    start: float,
    rules: dict,
    escalated: int,
    skipped_not_due: int,
    skipped_no_rule: int,
) -> None:
    duration = time.time() - start
    health = {
        "cache_key": "etl_health_escalation",
        "data": {
            "last_run": datetime.now(timezone.utc).isoformat(),
            "status": "success",
            "rules_active": len(rules),
            "escalated": escalated,
            "skipped_not_due": skipped_not_due,
            "skipped_no_rule": skipped_no_rule,
            "duration_seconds": round(duration, 2),
        },
        "source": "etl_incident_escalation",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    pg_post(
        "data_cache",
        [health],
        prefer="resolution=merge-duplicates,return=minimal",
        on_conflict="cache_key",
    )


if __name__ == "__main__":
    main()
