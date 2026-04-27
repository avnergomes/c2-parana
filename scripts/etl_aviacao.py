#!/usr/bin/env python3
"""ETL Aviacao: OpenSky Network REST API -> aviation_traffic.

Poll do endpoint /states/all com BBox do Parana. Conta gratuita registrada
expoe 4000 creditos/dia; uma chamada de BBox pequeno custa 1 credito, entao
cron de 5 min = 288 polls/dia, com 14x folga.

Sem credenciais cai em modo anonimo (400 creditos/dia, ~1 poll a cada 4 min).
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("etl_aviacao")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENSKY_USERNAME = os.environ.get("OPENSKY_USERNAME") or None
OPENSKY_PASSWORD = os.environ.get("OPENSKY_PASSWORD") or None

# BBox Parana (lamin, lamax, lomin, lomax conforme OpenSky)
LAMIN, LAMAX, LOMIN, LOMAX = -27.0, -22.5, -54.5, -48.0
OPENSKY_URL = "https://opensky-network.org/api/states/all"

# Indices dos campos no array de states (ordem documentada pela OpenSky).
# https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
F_ICAO24 = 0
F_CALLSIGN = 1
F_ORIGIN_COUNTRY = 2
F_TIME_POSITION = 3
F_LAST_CONTACT = 4
F_LONGITUDE = 5
F_LATITUDE = 6
F_BARO_ALTITUDE = 7
F_ON_GROUND = 8
F_VELOCITY = 9
F_TRUE_TRACK = 10
F_VERTICAL_RATE = 11
F_GEO_ALTITUDE = 13
F_SQUAWK = 14
F_CATEGORY = 17

RETENTION_DAYS = 7


@dataclass(frozen=True)
class AircraftState:
    icao24: str
    callsign: str | None
    origin_country: str | None
    latitude: float
    longitude: float
    baro_altitude_m: float | None
    geo_altitude_m: float | None
    velocity_ms: float | None
    true_track: float | None
    vertical_rate_ms: float | None
    on_ground: bool
    squawk: str | None
    category: int | None
    observed_at: str

    def to_row(self) -> dict[str, Any]:
        return {
            "icao24": self.icao24,
            "callsign": self.callsign,
            "origin_country": self.origin_country,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "baro_altitude_m": self.baro_altitude_m,
            "geo_altitude_m": self.geo_altitude_m,
            "velocity_ms": self.velocity_ms,
            "true_track": self.true_track,
            "vertical_rate_ms": self.vertical_rate_ms,
            "on_ground": self.on_ground,
            "squawk": self.squawk,
            "category": self.category,
            "source": "opensky",
            "observed_at": self.observed_at,
        }


def _parse_state(state: list[Any], snapshot_iso: str) -> AircraftState | None:
    """Parseia um array de state vector. Retorna None se posicao invalida."""
    try:
        icao24 = state[F_ICAO24]
        lat = state[F_LATITUDE]
        lon = state[F_LONGITUDE]
        if icao24 is None or lat is None or lon is None:
            return None

        callsign_raw = state[F_CALLSIGN]
        callsign = callsign_raw.strip() if isinstance(callsign_raw, str) else None
        if callsign == "":
            callsign = None

        # observed_at: usa time_position se disponivel; senao snapshot do request
        time_pos = state[F_TIME_POSITION]
        if isinstance(time_pos, (int, float)):
            observed_at = datetime.fromtimestamp(time_pos, tz=timezone.utc).isoformat()
        else:
            observed_at = snapshot_iso

        return AircraftState(
            icao24=str(icao24).strip().lower(),
            callsign=callsign,
            origin_country=state[F_ORIGIN_COUNTRY],
            latitude=float(lat),
            longitude=float(lon),
            baro_altitude_m=_safe_float(state, F_BARO_ALTITUDE),
            geo_altitude_m=_safe_float(state, F_GEO_ALTITUDE),
            velocity_ms=_safe_float(state, F_VELOCITY),
            true_track=_safe_float(state, F_TRUE_TRACK),
            vertical_rate_ms=_safe_float(state, F_VERTICAL_RATE),
            on_ground=bool(state[F_ON_GROUND]) if state[F_ON_GROUND] is not None else False,
            squawk=state[F_SQUAWK] if isinstance(state[F_SQUAWK], str) else None,
            category=_safe_int(state, F_CATEGORY),
            observed_at=observed_at,
        )
    except (IndexError, TypeError, ValueError) as err:
        log.debug("state malformado descartado: %s", err)
        return None


def _safe_float(state: list[Any], idx: int) -> float | None:
    try:
        v = state[idx]
        return float(v) if v is not None else None
    except (IndexError, TypeError, ValueError):
        return None


def _safe_int(state: list[Any], idx: int) -> int | None:
    try:
        v = state[idx]
        return int(v) if v is not None else None
    except (IndexError, TypeError, ValueError):
        return None


def fetch_opensky() -> list[AircraftState]:
    """Busca estado atual do trafego aereo no BBox PR com retry."""
    params = {"lamin": LAMIN, "lamax": LAMAX, "lomin": LOMIN, "lomax": LOMAX}
    auth = (
        (OPENSKY_USERNAME, OPENSKY_PASSWORD)
        if OPENSKY_USERNAME and OPENSKY_PASSWORD
        else None
    )
    if not auth:
        log.warning("OPENSKY_USERNAME/PASSWORD nao configurados — modo anonimo (400 creditos/dia)")

    base_delay = 2
    for attempt in range(3):
        try:
            resp = requests.get(OPENSKY_URL, params=params, auth=auth, timeout=30)
        except requests.RequestException as err:
            log.warning("OpenSky request falhou (tentativa %d): %s", attempt + 1, err)
            time.sleep(base_delay * (2**attempt))
            continue

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("X-Rate-Limit-Retry-After-Seconds", "60"))
            log.warning("OpenSky rate limit; retry em %ds", retry_after)
            time.sleep(min(retry_after, 120))
            continue

        if resp.status_code >= 500:
            log.warning("OpenSky %d (tentativa %d)", resp.status_code, attempt + 1)
            time.sleep(base_delay * (2**attempt))
            continue

        resp.raise_for_status()
        payload = resp.json()
        snapshot_unix = payload.get("time")
        snapshot_iso = (
            datetime.fromtimestamp(snapshot_unix, tz=timezone.utc).isoformat()
            if isinstance(snapshot_unix, (int, float))
            else datetime.now(tz=timezone.utc).isoformat()
        )
        states = payload.get("states") or []
        parsed = [s for s in (_parse_state(st, snapshot_iso) for st in states) if s]
        log.info("OpenSky: %d aeronaves recebidas, %d validas", len(states), len(parsed))
        return parsed

    log.error("OpenSky falhou apos 3 tentativas")
    return []


def _truncate_to_minute(iso_string: str) -> str:
    """Trunca ISO8601 ao minuto para evitar dedup excessivo (UNIQUE icao24+observed_at)."""
    dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    return dt.replace(second=0, microsecond=0).isoformat()


def _dedupe_by_minute(states: list[AircraftState]) -> list[AircraftState]:
    seen: dict[tuple[str, str], AircraftState] = {}
    for s in states:
        key = (s.icao24, _truncate_to_minute(s.observed_at))
        seen[key] = AircraftState(**{**s.__dict__, "observed_at": _truncate_to_minute(s.observed_at)})
    return list(seen.values())


def insert_with_dedupe(supabase: Any, states: list[AircraftState]) -> tuple[int, int, int]:
    """Insert um a um; ignora duplicatas (UNIQUE icao24+observed_at)."""
    inserted = 0
    skipped = 0
    errors = 0
    for state in states:
        try:
            supabase.table("aviation_traffic").insert(state.to_row()).execute()
            inserted += 1
        except Exception as err:
            msg = str(err).lower()
            if "duplicate key" in msg or "23505" in msg:
                skipped += 1
            else:
                errors += 1
                log.debug("insert err: %s", err)
    return inserted, skipped, errors


def purge_old(supabase: Any) -> None:
    cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    try:
        supabase.table("aviation_traffic").delete().lt("observed_at", cutoff).execute()
        log.info("purge: removidos registros < %s", cutoff)
    except Exception as err:
        log.warning("purge falhou: %s", err)


def record_health(supabase: Any, *, status: str, total: int, inserted: int, skipped: int, errors: int, duration_s: float) -> None:
    try:
        supabase.table("data_cache").upsert(
            {
                "cache_key": "etl_health_aviacao",
                "data": {
                    "last_run": datetime.now(tz=timezone.utc).isoformat(),
                    "status": status,
                    "total_received": total,
                    "inserted": inserted,
                    "skipped_dup": skipped,
                    "errors": errors,
                    "duration_seconds": duration_s,
                },
                "source": "etl_aviacao",
                "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
            },
            on_conflict="cache_key",
        ).execute()
    except Exception as err:
        log.warning("health record falhou: %s", err)


def main() -> None:
    start = time.time()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    states = fetch_opensky()
    if not states:
        record_health(
            supabase,
            status="empty",
            total=0,
            inserted=0,
            skipped=0,
            errors=0,
            duration_s=time.time() - start,
        )
        log.info("nenhuma aeronave detectada no BBox PR (pode ser noite/clima)")
        return

    deduped = _dedupe_by_minute(states)
    inserted, skipped, errors = insert_with_dedupe(supabase, deduped)
    log.info(
        "inserted=%d skipped_dup=%d errors=%d (de %d unicos por minuto)",
        inserted,
        skipped,
        errors,
        len(deduped),
    )

    purge_old(supabase)

    duration = time.time() - start
    status = "error" if errors > inserted else ("partial" if errors else "success")
    record_health(
        supabase,
        status=status,
        total=len(states),
        inserted=inserted,
        skipped=skipped,
        errors=errors,
        duration_s=duration,
    )
    log.info("done em %.1fs status=%s", duration, status)


if __name__ == "__main__":
    main()
