#!/usr/bin/env python3
"""ETL Anomalies: deteccao de anomalias estatisticas via z-score (Fase 3.F).

Para cada indicador numerico (temperature, humidity, aqi), calcula o z-score
da observacao mais recente contra uma janela rolante de 30 observacoes por
estacao/cidade. |z| > 3 gera um registro na tabela `anomalies` e uma
notification para os operadores.

Roda a cada hora via cron-anomalies.yml.
"""

import os
import sys
import statistics
from datetime import datetime, timezone

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

Z_THRESHOLD = 3.0
WINDOW_SIZE = 30  # observations per station


def postgrest_get(table: str, select: str = "*", params: dict | None = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            print(f"  WARN: GET {table} -> HTTP {resp.status_code}")
            return []
        return resp.json()
    except requests.exceptions.RequestException as e:
        print(f"  WARN: GET {table} -> {e}")
        return []


def postgrest_post(table: str, records: list, on_conflict: str | None = None) -> bool:
    if not records:
        return True
    # `on_conflict` sozinho nao faz upsert no PostgREST: sem
    # `resolution=merge-duplicates` o POST segue sendo INSERT puro e devolve
    # 409/23505 quando a linha ja existe. Aqui o bug nunca chegou a morder
    # porque detected_at entra na chave e e sempre novo, mas e o mesmo defeito
    # que deixou etl_dengue_projections 108 dias sem gravar.
    prefer = "return=minimal"
    if on_conflict:
        prefer = "resolution=merge-duplicates," + prefer
    post_headers = {**HEADERS, "Prefer": prefer}
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


def detect_climate_anomalies() -> list[dict]:
    """Detect anomalies in climate_data (temperature, humidity)."""
    # Get last 500 observations ordered by time (covers ~30 obs per station for ~15 stations)
    rows = postgrest_get(
        "climate_data",
        select="station_code,municipality,temperature,humidity,observed_at",
        params={"order": "observed_at.desc", "limit": "3000", "temperature": "not.is.null"},
    )
    if not rows:
        return []

    anomalies = []

    for indicator in ["temperature", "humidity"]:
        # Group by station
        by_station: dict[str, list] = {}
        for r in rows:
            code = r.get("station_code", "")
            val = r.get(indicator)
            if code and val is not None:
                by_station.setdefault(code, []).append({
                    "value": float(val),
                    "municipality": r.get("municipality", ""),
                    "observed_at": r.get("observed_at", ""),
                })

        for station, obs in by_station.items():
            if len(obs) < WINDOW_SIZE:
                continue

            # Most recent observation
            latest = obs[0]
            # Window = next 30 observations (excluding latest)
            window = [o["value"] for o in obs[1:WINDOW_SIZE + 1]]

            if len(window) < 10:
                continue

            mean = statistics.mean(window)
            stdev = statistics.stdev(window)

            if stdev < 0.01:
                continue  # No variance, skip

            z = (latest["value"] - mean) / stdev

            if abs(z) >= Z_THRESHOLD:
                anomalies.append({
                    "domain": "clima",
                    "indicator": indicator,
                    "station_code": station,
                    "municipality": latest["municipality"],
                    "observed_value": round(latest["value"], 2),
                    "z_score": round(z, 2),
                    "window_mean": round(mean, 2),
                    "window_stddev": round(stdev, 2),
                    "window_size": len(window),
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                })

    return anomalies


def detect_air_quality_anomalies() -> list[dict]:
    """Detect anomalies in air_quality (aqi)."""
    rows = postgrest_get(
        "air_quality",
        select="city,aqi,observed_at",
        params={"order": "observed_at.desc", "limit": "1000"},
    )
    if not rows:
        return []

    anomalies = []
    by_city: dict[str, list] = {}
    for r in rows:
        city = r.get("city", "")
        aqi = r.get("aqi")
        if city and aqi is not None:
            by_city.setdefault(city, []).append(float(aqi))

    for city, values in by_city.items():
        if len(values) < WINDOW_SIZE:
            continue

        latest_val = values[0]
        window = values[1:WINDOW_SIZE + 1]

        if len(window) < 10:
            continue

        mean = statistics.mean(window)
        stdev = statistics.stdev(window)

        if stdev < 0.01:
            continue

        z = (latest_val - mean) / stdev

        if abs(z) >= Z_THRESHOLD:
            anomalies.append({
                "domain": "ar",
                "indicator": "aqi",
                "station_code": city,
                "municipality": city,
                "observed_value": round(latest_val, 2),
                "z_score": round(z, 2),
                "window_mean": round(mean, 2),
                "window_stddev": round(stdev, 2),
                "window_size": len(window),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

    return anomalies


def emit_notifications(anomalies: list[dict]) -> int:
    """Create notifications for detected anomalies."""
    if not anomalies:
        return 0

    notifications = []
    for a in anomalies:
        direction = "acima" if a["z_score"] > 0 else "abaixo"
        unit = "C" if a["indicator"] == "temperature" else ("%" if a["indicator"] == "humidity" else "AQI")
        notifications.append({
            "channel": "in_app",
            "title": f"Anomalia: {a['indicator']} {direction} do normal em {a['municipality']}",
            "body": (
                f"{a['indicator'].title()} = {a['observed_value']}{unit} "
                f"(z-score: {a['z_score']}, media: {a['window_mean']}{unit})"
            ),
            "severity": "high" if abs(a["z_score"]) >= 4 else "medium",
            "metadata": {
                "domain": a["domain"],
                "indicator": a["indicator"],
                "station_code": a["station_code"],
                "z_score": a["z_score"],
            },
        })

    postgrest_post("notifications", notifications)
    return len(notifications)


def main():
    start = datetime.now()
    print("=== ETL Anomalias Estatisticas (Fase 3.F) ===")

    all_anomalies = []

    # 1. Climate anomalies
    print("\n[1/2] Anomalias climaticas (temperature, humidity)...")
    clima = detect_climate_anomalies()
    print(f"  {len(clima)} anomalias detectadas")
    all_anomalies.extend(clima)

    # 2. Air quality anomalies
    print("\n[2/2] Anomalias qualidade do ar (aqi)...")
    ar = detect_air_quality_anomalies()
    print(f"  {len(ar)} anomalias detectadas")
    all_anomalies.extend(ar)

    # Persist to anomalies table
    if all_anomalies:
        print(f"\nPersistindo {len(all_anomalies)} anomalias...")
        postgrest_post("anomalies", all_anomalies, on_conflict="domain,indicator,station_code,detected_at")

        # Emit notifications
        notif_count = emit_notifications(all_anomalies)
        print(f"  {notif_count} notificacoes emitidas")
    else:
        print("\nNenhuma anomalia detectada (todos os indicadores dentro da normalidade)")

    for a in all_anomalies:
        print(f"  {a['domain']}/{a['indicator']} @ {a['station_code']}: "
              f"valor={a['observed_value']} z={a['z_score']} (media={a['window_mean']})")

    duration = (datetime.now() - start).total_seconds()
    _write_health(len(all_anomalies), duration)
    print(f"\nETL Anomalias concluido em {duration:.1f}s | {len(all_anomalies)} anomalias")


def _write_health(anomalies: int, duration_s: float) -> None:
    """Grava etl_health_anomalies em data_cache.

    Este ETL e um detector: zero anomalias e resultado valido, nao falha. Sem
    health record, a unica evidencia de execucao era uma linha nova em
    `anomalies` -- entao um periodo normal (nada detectado) ficava indistinguivel
    de pipeline morto, e a view public.etl_freshness o marcava como atrasado.
    """
    now = datetime.now(timezone.utc).isoformat()
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/data_cache",
            headers={
                **HEADERS,
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            params={"on_conflict": "cache_key"},
            json=[{
                "cache_key": "etl_health_anomalies",
                "source": "etl_anomalies",
                "data": {
                    "last_run": now,
                    "status": "success",
                    "anomalies_detected": anomalies,
                    "duration_seconds": round(duration_s, 2),
                    "runtime": "github-actions",
                },
                "fetched_at": now,
            }],
            timeout=15,
        )
    except Exception as err:  # health nunca pode derrubar o ETL
        print(f"  AVISO: health record falhou: {err}")


if __name__ == "__main__":
    main()
