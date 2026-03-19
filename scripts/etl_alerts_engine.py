#!/usr/bin/env python3
"""ETL Alerts Engine: avalia regras de alerta contra dados atuais e cria notificações.

Busca alert_rules ativas, avalia condições contra dados de cada domínio
(clima, saude, ambiente, hidro, ar, composto), respeita cooldown,
e insere notificações para usuários elegíveis.

Usa PostgREST API via requests (não supabase-py) para evitar problemas de RLS.
"""

import os
import json
import time
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

# ─── SUPABASE CONFIG ────────────────────────────────────────────────

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}

REST_URL = f"{url}/rest/v1"

SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


# ─── POSTGREST HELPERS ──────────────────────────────────────────────

def pg_get(table, params=None):
    """GET request to PostgREST. Returns list of records or empty list."""
    try:
        resp = requests.get(f"{REST_URL}/{table}", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  ERRO pg_get {table}: {e}")
        return []


def pg_post(table, data):
    """POST (insert) to PostgREST. Returns response or None."""
    try:
        post_headers = {**headers, "Prefer": "return=minimal"}
        resp = requests.post(f"{REST_URL}/{table}", headers=post_headers, json=data, timeout=30)
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"  ERRO pg_post {table}: {e}")
        return None


def pg_upsert(table, data, on_conflict):
    """UPSERT via PostgREST (POST with Prefer: resolution=merge-duplicates)."""
    try:
        upsert_headers = {
            **headers,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
        resp = requests.post(
            f"{REST_URL}/{table}",
            headers=upsert_headers,
            json=data,
            params={"on_conflict": on_conflict},
            timeout=30,
        )
        resp.raise_for_status()
        return resp
    except Exception as e:
        print(f"  ERRO pg_upsert {table}: {e}")
        return None


# ─── TELEGRAM ───────────────────────────────────────────────────────

def send_telegram(title, body, severity):
    """Envia notificação via Telegram bot (opcional, skip se tokens não configurados)."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return
    emoji = {"critical": "\U0001f534", "high": "\U0001f7e0", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(severity, "\u26aa")
    text = f"{emoji} *{title}*\n{body}"
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
    except Exception as e:
        print(f"  AVISO telegram: {e}")


# ─── DATA FETCHERS PER DOMAIN ──────────────────────────────────────

def fetch_domain_data(domain):
    """Busca dados atuais relevantes para o domínio da regra.

    Retorna lista de dicts com os campos que serão avaliados.
    """
    if domain == "clima":
        return _fetch_clima()
    elif domain == "saude":
        return _fetch_saude()
    elif domain == "ambiente":
        return _fetch_ambiente()
    elif domain == "hidro":
        return _fetch_hidro()
    elif domain == "ar":
        return _fetch_ar()
    elif domain == "composto":
        return _fetch_composto()
    else:
        print(f"  Domínio desconhecido: {domain}")
        return []


def _fetch_clima():
    """Busca últimos dados de climate_data, agrupa por estação (mais recente)."""
    records = pg_get("climate_data", {
        "select": "station_code,station_name,municipality,temperature,humidity,pressure,wind_speed,precipitation,observed_at",
        "order": "observed_at.desc",
        "limit": "100",
    })
    # Pegar o registro mais recente por estação
    seen = set()
    latest = []
    for r in records:
        sc = r.get("station_code")
        if sc and sc not in seen:
            seen.add(sc)
            latest.append(r)
    # Calcular precipitation_24h como soma por estação (todas as leituras recentes)
    precip_by_station = {}
    for r in records:
        sc = r.get("station_code", "")
        precip_by_station.setdefault(sc, 0.0)
        precip_by_station[sc] += float(r.get("precipitation") or 0)
    for item in latest:
        item["precipitation_24h"] = precip_by_station.get(item.get("station_code"), 0.0)
    return latest


def _fetch_saude():
    """Busca últimos dados de dengue_data (semana mais recente)."""
    records = pg_get("dengue_data", {
        "select": "ibge_code,municipality_name,epidemiological_week,year,cases,alert_level,incidence_rate",
        "order": "year.desc,epidemiological_week.desc",
        "limit": "200",
    })
    # Pegar semana mais recente por município
    seen = set()
    latest = []
    for r in records:
        ibge = r.get("ibge_code")
        if ibge and ibge not in seen:
            seen.add(ibge)
            latest.append(r)
    return latest


def _fetch_ambiente():
    """Conta focos de incêndio nas últimas 24h."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d")
    records = pg_get("fire_spots", {
        "select": "id",
        "acq_date": f"gte.{cutoff}",
    })
    count = len(records)
    # Retorna um registro agregado
    return [{"fire_spots_24h": count}]


def _fetch_hidro():
    """Busca níveis de rios."""
    records = pg_get("river_levels", {
        "select": "station_code,station_name,river_name,municipality,level_cm,flow_m3s,alert_level,observed_at",
    })
    return records


def _fetch_ar():
    """Busca qualidade do ar."""
    records = pg_get("air_quality", {
        "select": "city,station_name,aqi,dominant_pollutant,pm25,pm10,observed_at",
    })
    return records


def _fetch_composto():
    """Busca IRTC scores."""
    records = pg_get("irtc_scores", {
        "select": "ibge_code,municipality,irtc_score,risk_level",
    })
    return records


# ─── CONDITION EVALUATION ───────────────────────────────────────────

OPERATORS = {
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    "=": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def evaluate_condition(condition, data_records):
    """Avalia condição JSON contra lista de registros de dados.

    Retorna (triggered: bool, matching_records: list) onde matching_records
    são os registros que ativaram a regra.

    Para domínios com múltiplos registros (clima, hidro, ar, saude):
      - Verifica cada registro individualmente.
    Para domínios agregados (ambiente):
      - Verifica o registro agregado.

    condition format: {"field": "temperature", "operator": ">", "threshold": 40}
    """
    field = condition.get("field")
    operator = condition.get("operator")
    threshold = condition.get("threshold")

    if not field or not operator or threshold is None:
        print(f"  Condição incompleta: {condition}")
        return False, []

    op_fn = OPERATORS.get(operator)
    if op_fn is None:
        print(f"  Operador desconhecido: {operator}")
        return False, []

    matching = []
    for record in data_records:
        value = record.get(field)
        if value is None:
            continue

        try:
            # Comparação numérica se threshold é número
            if isinstance(threshold, (int, float)):
                value = float(value)
                threshold_cmp = float(threshold)
            else:
                # Comparação como string
                value = str(value)
                threshold_cmp = str(threshold)

            if op_fn(value, threshold_cmp):
                matching.append(record)
        except (ValueError, TypeError):
            continue

    return len(matching) > 0, matching


# ─── COOLDOWN CHECK ─────────────────────────────────────────────────

def check_cooldown(rule_id, cooldown_minutes):
    """Verifica se o cooldown da regra já passou desde a última notificação.

    Retorna True se pode disparar (cooldown passou), False se ainda em cooldown.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)).isoformat()
    recent = pg_get("notifications", {
        "select": "id,sent_at",
        "rule_id": f"eq.{rule_id}",
        "sent_at": f"gte.{cutoff}",
        "limit": "1",
    })
    return len(recent) == 0


# ─── NOTIFICATION CREATION ──────────────────────────────────────────

def create_notifications(rule, matching_records):
    """Cria notificações para todos os usuários elegíveis.

    Retorna número de notificações criadas.
    """
    rule_id = rule["id"]
    severity = rule["severity"]
    channels = rule.get("channels", ["push"])
    title = rule["name"]
    description = rule.get("description", "")

    # Construir body com detalhes dos registros que ativaram
    body = _build_notification_body(rule, matching_records)

    # Buscar todos os usuários com profiles
    users = pg_get("profiles", {"select": "id"})
    if not users:
        print(f"    Nenhum usuário encontrado para notificar")
        return 0

    # Buscar preferências de notificação
    prefs = pg_get("notification_preferences", {"select": "user_id,min_severity,push_enabled,email_enabled,telegram_enabled"})
    prefs_by_user = {p["user_id"]: p for p in prefs}

    notifications = []
    severity_rank = SEVERITY_ORDER.get(severity, 0)

    for user in users:
        user_id = user["id"]
        user_prefs = prefs_by_user.get(user_id, {})

        # Verificar severidade mínima do usuário
        min_sev = user_prefs.get("min_severity", "medium")
        min_rank = SEVERITY_ORDER.get(min_sev, 1)
        if severity_rank < min_rank:
            continue

        for channel in channels:
            # Verificar se canal está habilitado para o usuário
            if channel == "push" and not user_prefs.get("push_enabled", True):
                continue
            if channel == "email" and not user_prefs.get("email_enabled", True):
                continue
            if channel == "telegram" and not user_prefs.get("telegram_enabled", False):
                continue

            notifications.append({
                "rule_id": rule_id,
                "user_id": user_id,
                "channel": channel,
                "title": title,
                "body": body,
                "severity": severity,
                "metadata": json.dumps({
                    "domain": rule["domain"],
                    "condition": rule["condition"],
                    "matching_count": len(matching_records),
                    "triggered_at": datetime.now(timezone.utc).isoformat(),
                }),
                "is_read": False,
            })

    if not notifications:
        return 0

    # Inserir em lotes de 100
    created = 0
    for i in range(0, len(notifications), 100):
        batch = notifications[i:i + 100]
        result = pg_post("notifications", batch)
        if result is not None:
            created += len(batch)

    # Enviar via Telegram se canal incluído e tokens configurados
    if "telegram" in channels:
        send_telegram(title, body, severity)

    return created


def _build_notification_body(rule, matching_records):
    """Constrói corpo da notificação com detalhes dos registros que ativaram."""
    domain = rule["domain"]
    condition = rule.get("condition", {})
    description = rule.get("description", "")
    field = condition.get("field", "")
    operator = condition.get("operator", "")
    threshold = condition.get("threshold", "")

    lines = [description] if description else []
    lines.append(f"Condição: {field} {operator} {threshold}")

    if domain == "clima":
        for r in matching_records[:5]:
            station = r.get("station_name", r.get("station_code", "?"))
            val = r.get(field, "?")
            lines.append(f"  - {station}: {field}={val}")
    elif domain == "saude":
        for r in matching_records[:5]:
            mun = r.get("municipality_name", r.get("ibge_code", "?"))
            val = r.get(field, "?")
            lines.append(f"  - {mun}: {field}={val}")
    elif domain == "ambiente":
        for r in matching_records[:3]:
            val = r.get(field, "?")
            lines.append(f"  - {field}={val}")
    elif domain == "hidro":
        for r in matching_records[:5]:
            station = r.get("station_name", r.get("station_code", "?"))
            river = r.get("river_name", "")
            val = r.get(field, "?")
            lines.append(f"  - {station} ({river}): {field}={val}")
    elif domain == "ar":
        for r in matching_records[:5]:
            city = r.get("city", r.get("station_name", "?"))
            val = r.get(field, "?")
            lines.append(f"  - {city}: {field}={val}")
    elif domain == "composto":
        for r in matching_records[:5]:
            mun = r.get("municipality", r.get("ibge_code", "?"))
            val = r.get(field, "?")
            lines.append(f"  - {mun}: {field}={val}")

    if len(matching_records) > 5:
        lines.append(f"  ... e mais {len(matching_records) - 5} registros")

    return "\n".join(lines)


# ─── HEALTH TRACKING ────────────────────────────────────────────────

def save_health(status, stats, errors, duration_seconds):
    """Salva registro de saúde do ETL na tabela data_cache."""
    now = datetime.now(timezone.utc).isoformat()
    health_record = {
        "cache_key": "etl_health_alerts",
        "data": json.dumps({
            "last_run": now,
            "status": status,
            "rules_evaluated": stats.get("rules_evaluated", 0),
            "alerts_fired": stats.get("alerts_fired", 0),
            "notifications_created": stats.get("notifications_created", 0),
            "cooldown_skipped": stats.get("cooldown_skipped", 0),
            "condition_not_met": stats.get("condition_not_met", 0),
            "duration_seconds": round(duration_seconds, 2),
            "errors": errors,
        }),
        "source": "etl_alerts_engine",
        "fetched_at": now,
    }
    pg_upsert("data_cache", health_record, "cache_key")


# ─── MAIN ───────────────────────────────────────────────────────────

def main():
    start_time = time.time()
    now = datetime.now(timezone.utc)
    print(f"ETL Alerts Engine — {now.isoformat()}")
    print("=" * 60)

    errors = []
    stats = {
        "rules_evaluated": 0,
        "alerts_fired": 0,
        "notifications_created": 0,
        "cooldown_skipped": 0,
        "condition_not_met": 0,
    }

    # 1. Buscar regras ativas
    print("\n1/3 Buscando regras de alerta ativas...")
    rules = pg_get("alert_rules", {
        "select": "*",
        "is_active": "eq.true",
    })
    print(f"  {len(rules)} regras ativas encontradas")

    if not rules:
        print("  Nenhuma regra ativa. Encerrando.")
        duration = time.time() - start_time
        save_health("success", stats, errors, duration)
        return

    # 2. Agrupar regras por domínio para evitar fetch repetido
    rules_by_domain = {}
    for rule in rules:
        domain = rule.get("domain", "")
        rules_by_domain.setdefault(domain, []).append(rule)

    # 3. Avaliar cada domínio
    print("\n2/3 Avaliando regras por domínio...")
    for domain, domain_rules in rules_by_domain.items():
        print(f"\n  --- Domínio: {domain} ({len(domain_rules)} regras) ---")

        # Buscar dados do domínio uma vez
        data_records = fetch_domain_data(domain)
        if not data_records:
            print(f"    Sem dados para domínio {domain}, pulando regras")
            for rule in domain_rules:
                stats["rules_evaluated"] += 1
                stats["condition_not_met"] += 1
            continue

        print(f"    {len(data_records)} registros de dados obtidos")

        for rule in domain_rules:
            stats["rules_evaluated"] += 1
            rule_name = rule.get("name", rule["id"])
            condition = rule.get("condition", {})

            # Parsear condition se vier como string JSON
            if isinstance(condition, str):
                try:
                    condition = json.loads(condition)
                except json.JSONDecodeError:
                    print(f"    [{rule_name}] Condição JSON inválida: {condition}")
                    errors.append(f"Condição inválida para regra {rule_name}")
                    continue

            # Avaliar condição
            triggered, matching = evaluate_condition(condition, data_records)

            if not triggered:
                print(f"    [{rule_name}] Condição NÃO atendida")
                stats["condition_not_met"] += 1
                continue

            print(f"    [{rule_name}] Condição ATENDIDA ({len(matching)} registros)")

            # Verificar cooldown
            cooldown_minutes = rule.get("cooldown_minutes", 60)
            if not check_cooldown(rule["id"], cooldown_minutes):
                print(f"    [{rule_name}] Em cooldown ({cooldown_minutes}min), pulando")
                stats["cooldown_skipped"] += 1
                continue

            # Criar notificações
            stats["alerts_fired"] += 1
            try:
                count = create_notifications(rule, matching)
                stats["notifications_created"] += count
                print(f"    [{rule_name}] {count} notificações criadas")
            except Exception as e:
                print(f"    [{rule_name}] ERRO ao criar notificações: {e}")
                errors.append(f"Notificação {rule_name}: {str(e)}")

    # 4. Health tracking
    print("\n3/3 Salvando health check...")
    duration = time.time() - start_time
    status = "success"
    if errors:
        status = "partial" if stats["alerts_fired"] > 0 else "error"

    save_health(status, stats, errors, duration)

    # 5. Resumo
    print("\n" + "=" * 60)
    print(f"ETL Alerts Engine concluído!")
    print(f"  Status: {status}")
    print(f"  Regras avaliadas: {stats['rules_evaluated']}")
    print(f"  Alertas disparados: {stats['alerts_fired']}")
    print(f"  Notificações criadas: {stats['notifications_created']}")
    print(f"  Cooldown (skip): {stats['cooldown_skipped']}")
    print(f"  Condição não atendida: {stats['condition_not_met']}")
    print(f"  Erros: {len(errors)}")
    print(f"  Duração: {duration:.2f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
