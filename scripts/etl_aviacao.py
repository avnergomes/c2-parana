#!/usr/bin/env python3
"""ETL Aviacao: airplanes.live REST -> aviation_traffic.

airplanes.live e um agregador comunitario de feeders ADS-B (mesma fonte
que adsbexchange usava). API publica, gratis, sem auth, sem registro.

Endpoint /v2/point/{lat}/{lon}/{radius_nm} retorna ate 1000 aeronaves
em raio NM. Para cobrir o Parana (~600x500 km) usamos centro -24.89,
-51.55 e raio 250 NM (~463 km), com folga ate as bordas.

Rate limit: 1 req/segundo. Cron 5min = ~288 reqs/dia, sem pressao.
Termos: nao comercial / situational awareness publico OK com User-Agent.
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

# Centroide do PR + raio que cobre todo o estado com folga (250 NM ~ 463 km)
PR_CENTER_LAT = -24.89
PR_CENTER_LON = -51.55
RADIUS_NM = 250

AIRPLANES_LIVE_URL = (
    f"https://api.airplanes.live/v2/point/{PR_CENTER_LAT}/{PR_CENTER_LON}/{RADIUS_NM}"
)
USER_AGENT = "c2-parana/1.0 (+https://github.com/avnergomes/c2-parana)"

# Conversoes
FT_TO_M = 0.3048
KT_TO_MS = 0.514444
FTMIN_TO_MS = 0.00508

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
            "source": "airplanes.live",
            "observed_at": self.observed_at,
        }


def _safe_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _parse_alt(value: Any) -> float | None:
    """alt_baro/alt_geom podem vir como numero (ft) ou string 'ground'."""
    if value is None:
        return None
    if isinstance(value, str):
        if value.lower() == "ground":
            return 0.0
        try:
            return float(value) * FT_TO_M
        except ValueError:
            return None
    try:
        return float(value) * FT_TO_M
    except (TypeError, ValueError):
        return None


def _parse_category(raw: Any) -> int | None:
    """airplanes.live retorna category como string tipo 'A1', 'A3'. Mapeamos para int 1-7."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and len(raw) >= 2 and raw[0].upper() == "A":
        try:
            return int(raw[1])
        except ValueError:
            return None
    return None


def _parse_aircraft(record: dict[str, Any], snapshot_iso: str) -> AircraftState | None:
    icao24 = record.get("hex")
    lat = record.get("lat")
    lon = record.get("lon")
    if not icao24 or lat is None or lon is None:
        return None

    callsign_raw = record.get("flight")
    callsign = callsign_raw.strip() if isinstance(callsign_raw, str) else None
    if callsign == "":
        callsign = None

    alt_baro_raw = record.get("alt_baro")
    on_ground = (
        isinstance(alt_baro_raw, str) and alt_baro_raw.lower() == "ground"
    ) or bool(record.get("ground"))

    # observed_at: se seen_pos disponivel, ajusta o snapshot pra tras
    seen_pos = record.get("seen_pos")
    if isinstance(seen_pos, (int, float)) and seen_pos < 60:
        observed_dt = datetime.fromisoformat(snapshot_iso) - timedelta(seconds=int(seen_pos))
        observed_at = observed_dt.isoformat()
    else:
        observed_at = snapshot_iso

    velocity_kt = _safe_float(record.get("gs"))
    velocity_ms = velocity_kt * KT_TO_MS if velocity_kt is not None else None

    vrate_ftmin = _safe_float(record.get("baro_rate") or record.get("geom_rate"))
    vertical_rate_ms = vrate_ftmin * FTMIN_TO_MS if vrate_ftmin is not None else None

    return AircraftState(
        icao24=str(icao24).strip().lower(),
        callsign=callsign,
        origin_country=record.get("r"),  # registration prefix, se disponivel
        latitude=float(lat),
        longitude=float(lon),
        baro_altitude_m=_parse_alt(alt_baro_raw),
        geo_altitude_m=_parse_alt(record.get("alt_geom")),
        velocity_ms=velocity_ms,
        true_track=_safe_float(record.get("track")),
        vertical_rate_ms=vertical_rate_ms,
        on_ground=on_ground,
        squawk=str(record.get("squawk")) if record.get("squawk") is not None else None,
        category=_parse_category(record.get("category")),
        observed_at=observed_at,
    )


def fetch_airplanes_live() -> list[AircraftState]:
    """Busca aeronaves no raio do centroide PR com retry exponencial."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    base_delay = 2
    for attempt in range(3):
        try:
            resp = requests.get(AIRPLANES_LIVE_URL, headers=headers, timeout=30)
        except requests.RequestException as err:
            log.warning("airplanes.live request falhou (tentativa %d): %s", attempt + 1, err)
            time.sleep(base_delay * (2**attempt))
            continue

        if resp.status_code == 429:
            log.warning("rate limited; backoff %ds", base_delay * (2**attempt))
            time.sleep(base_delay * (2**attempt))
            continue

        if resp.status_code >= 500:
            log.warning("airplanes.live %d (tentativa %d)", resp.status_code, attempt + 1)
            time.sleep(base_delay * (2**attempt))
            continue

        resp.raise_for_status()
        payload = resp.json()
        snapshot_iso = datetime.now(tz=timezone.utc).isoformat()
        ac_list = payload.get("ac") or []
        parsed = [a for a in (_parse_aircraft(rec, snapshot_iso) for rec in ac_list) if a]
        log.info("airplanes.live: %d aeronaves recebidas, %d validas", len(ac_list), len(parsed))
        return parsed

    log.error("airplanes.live falhou apos 3 tentativas")
    return []


def _truncate_to_minute(iso_string: str) -> str:
    dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    return dt.replace(second=0, microsecond=0).isoformat()


def _dedupe_by_minute(states: list[AircraftState]) -> list[AircraftState]:
    seen: dict[tuple[str, str], AircraftState] = {}
    for s in states:
        key = (s.icao24, _truncate_to_minute(s.observed_at))
        seen[key] = AircraftState(
            **{**s.__dict__, "observed_at": _truncate_to_minute(s.observed_at)}
        )
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


def record_health(
    supabase: Any,
    *,
    status: str,
    total: int,
    inserted: int,
    skipped: int,
    errors: int,
    duration_s: float,
) -> None:
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
                    "source": "airplanes.live",
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

    states = fetch_airplanes_live()
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
        log.info("nenhuma aeronave detectada (pode ser noite/clima/upstream)")
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
