#!/usr/bin/env python3
"""ETL Maritimo: AISStream.io WebSocket -> maritime_traffic.

Conexao stream com BBox cobrindo a costa do Parana e a aproximacao maritima
ao porto de Paranagua/Antonina. Em GitHub Actions abrimos o socket por uma
janela curta (~75s), agregamos ultima posicao por MMSI e fazemos batch upsert.

Mensagens AIS relevantes:
  - PositionReport (tipo 1/2/3): underway com SOG/COG/heading
  - StandardClassBPositionReport: pequenos navios
  - ShipStaticData (tipo 5): metadata do navio (nome, tipo, dimensoes, destino)

A rota AISStream entrega ambos no mesmo socket; o ETL combina por MMSI.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import websockets
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("etl_maritimo")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
AISSTREAM_API_KEY = os.environ.get("AISSTREAM_API_KEY")

# BBox costa PR + aproximacao Atlantica (cobertura AIS volunter-fed e
# esparsa ao sul do Brasil; ampliamos pra capturar trafego em transito
# alem da janela imediata de Paranagua/Antonina).
# Formato AISStream: [[ [latS, lonW], [latN, lonE] ]]
PR_MARITIME_BBOX = [[[-27.5, -49.0], [-23.5, -45.0]]]

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
LISTEN_SECONDS = 75
RETENTION_DAYS = 7

# AIS ship type categorias (resumo do ITU-R M.1371)
SHIP_TYPE_LABELS: dict[int, str] = {
    0: "Not available",
    20: "WIG",
    30: "Fishing",
    31: "Towing",
    32: "Towing > 200m",
    33: "Dredging",
    34: "Diving",
    35: "Military",
    36: "Sailing",
    37: "Pleasure",
    40: "High-speed craft",
    50: "Pilot",
    51: "Search and rescue",
    52: "Tug",
    53: "Port tender",
    54: "Anti-pollution",
    55: "Law enforcement",
    58: "Medical transport",
    60: "Passenger",
    70: "Cargo",
    71: "Cargo (HazA)",
    72: "Cargo (HazB)",
    73: "Cargo (HazC)",
    74: "Cargo (HazD)",
    80: "Tanker",
    81: "Tanker (HazA)",
    82: "Tanker (HazB)",
    83: "Tanker (HazC)",
    84: "Tanker (HazD)",
    90: "Other",
}

NAV_STATUS_LABELS: dict[int, str] = {
    0: "Under way using engine",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuverability",
    4: "Constrained by draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way sailing",
    15: "Undefined",
}


def _ship_type_label(code: int | None) -> str | None:
    if code is None:
        return None
    if code in SHIP_TYPE_LABELS:
        return SHIP_TYPE_LABELS[code]
    if 70 <= code <= 79:
        return "Cargo"
    if 80 <= code <= 89:
        return "Tanker"
    if 60 <= code <= 69:
        return "Passenger"
    return "Other"


@dataclass
class VesselSnapshot:
    """Estado agregado mais recente de um MMSI durante a janela de coleta."""

    mmsi: int
    latitude: float | None = None
    longitude: float | None = None
    sog_knots: float | None = None
    cog_deg: float | None = None
    heading_deg: float | None = None
    nav_status: int | None = None
    observed_at: str = field(default_factory=lambda: datetime.now(tz=timezone.utc).isoformat())
    # static metadata (ShipStaticData)
    imo: int | None = None
    vessel_name: str | None = None
    callsign: str | None = None
    ship_type: int | None = None
    destination: str | None = None
    eta: str | None = None
    draught_m: float | None = None
    length_m: int | None = None
    width_m: int | None = None

    def has_position(self) -> bool:
        return self.latitude is not None and self.longitude is not None

    def to_row(self) -> dict[str, Any]:
        return {
            "mmsi": self.mmsi,
            "imo": self.imo,
            "vessel_name": self.vessel_name,
            "callsign": self.callsign,
            "ship_type": self.ship_type,
            "ship_type_label": _ship_type_label(self.ship_type),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "sog_knots": self.sog_knots,
            "cog_deg": self.cog_deg,
            "heading_deg": self.heading_deg,
            "nav_status": self.nav_status,
            "nav_status_label": NAV_STATUS_LABELS.get(self.nav_status) if self.nav_status is not None else None,
            "destination": self.destination,
            "eta": self.eta,
            "draught_m": self.draught_m,
            "length_m": self.length_m,
            "width_m": self.width_m,
            "source": "aisstream",
            "observed_at": self.observed_at,
        }


def _truncate_to_minute(iso_string: str) -> str:
    dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    return dt.replace(second=0, microsecond=0).isoformat()


def _ingest_position(snap: VesselSnapshot, msg: dict[str, Any], meta: dict[str, Any]) -> None:
    snap.latitude = msg.get("Latitude")
    snap.longitude = msg.get("Longitude")
    sog = msg.get("Sog")
    snap.sog_knots = float(sog) if sog is not None else None
    cog = msg.get("Cog")
    snap.cog_deg = float(cog) if cog is not None else None
    heading = msg.get("TrueHeading")
    if heading is not None and heading != 511:  # 511 = nao disponivel
        snap.heading_deg = float(heading)
    snap.nav_status = msg.get("NavigationalStatus")
    ts = meta.get("time_utc")
    if ts:
        snap.observed_at = ts


def _ingest_static(snap: VesselSnapshot, msg: dict[str, Any]) -> None:
    snap.imo = msg.get("ImoNumber") or snap.imo
    name = msg.get("Name")
    if isinstance(name, str) and name.strip():
        snap.vessel_name = name.strip()
    cs = msg.get("CallSign")
    if isinstance(cs, str) and cs.strip():
        snap.callsign = cs.strip()
    snap.ship_type = msg.get("Type") or snap.ship_type
    dest = msg.get("Destination")
    if isinstance(dest, str) and dest.strip():
        snap.destination = dest.strip()
    eta = msg.get("Eta")
    if eta:
        # AISStream entrega Eta como string ja formatada; preservamos
        snap.eta = str(eta)
    draught = msg.get("MaximumStaticDraught")
    if draught:
        snap.draught_m = float(draught)
    dim = msg.get("Dimension")
    if isinstance(dim, dict):
        a = dim.get("A") or 0
        b = dim.get("B") or 0
        c = dim.get("C") or 0
        d = dim.get("D") or 0
        if a + b > 0:
            snap.length_m = int(a + b)
        if c + d > 0:
            snap.width_m = int(c + d)


async def collect_vessels(window_seconds: int = LISTEN_SECONDS) -> list[VesselSnapshot]:
    """Conecta no AISStream, coleta por window_seconds, retorna snapshots agregados."""
    if not AISSTREAM_API_KEY:
        log.error("AISSTREAM_API_KEY nao configurado — abortando")
        return []

    subscribe = {
        "APIKey": AISSTREAM_API_KEY,
        "BoundingBoxes": PR_MARITIME_BBOX,
        "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
    }

    vessels: dict[int, VesselSnapshot] = {}
    deadline = time.time() + window_seconds

    try:
        async with websockets.connect(AISSTREAM_URL, ping_interval=20, ping_timeout=10) as ws:
            await ws.send(json.dumps(subscribe))
            log.info("AISStream conectado, coletando por %ds...", window_seconds)

            while time.time() < deadline:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break

                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                if "error" in payload:
                    log.error("AISStream error: %s", payload["error"])
                    break

                meta = payload.get("MetaData") or {}
                mmsi = meta.get("MMSI")
                if not isinstance(mmsi, int):
                    continue

                snap = vessels.setdefault(mmsi, VesselSnapshot(mmsi=mmsi))
                ship_name = meta.get("ShipName")
                if isinstance(ship_name, str) and ship_name.strip() and not snap.vessel_name:
                    snap.vessel_name = ship_name.strip()

                msg_type = payload.get("MessageType")
                msg_body = (payload.get("Message") or {}).get(msg_type) or {}

                if msg_type in ("PositionReport", "StandardClassBPositionReport"):
                    _ingest_position(snap, msg_body, meta)
                elif msg_type == "ShipStaticData":
                    _ingest_static(snap, msg_body)
    except websockets.exceptions.WebSocketException as err:
        log.warning("WebSocket erro: %s", err)
    except Exception as err:
        log.warning("erro inesperado coletando AIS: %s", err)

    valid = [v for v in vessels.values() if v.has_position()]
    log.info("AISStream: %d MMSI distintos, %d com posicao valida", len(vessels), len(valid))
    return valid


def insert_with_dedupe(supabase: Any, snapshots: list[VesselSnapshot]) -> tuple[int, int, int]:
    inserted = 0
    skipped = 0
    errors = 0
    for snap in snapshots:
        # Trunca observed_at ao minuto para casar com UNIQUE(mmsi, observed_at)
        snap.observed_at = _truncate_to_minute(snap.observed_at)
        try:
            supabase.table("maritime_traffic").insert(snap.to_row()).execute()
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
        supabase.table("maritime_traffic").delete().lt("observed_at", cutoff).execute()
        log.info("purge: removidos registros < %s", cutoff)
    except Exception as err:
        log.warning("purge falhou: %s", err)


def record_health(supabase: Any, *, status: str, total: int, inserted: int, skipped: int, errors: int, duration_s: float) -> None:
    try:
        supabase.table("data_cache").upsert(
            {
                "cache_key": "etl_health_maritimo",
                "data": {
                    "last_run": datetime.now(tz=timezone.utc).isoformat(),
                    "status": status,
                    "total_vessels": total,
                    "inserted": inserted,
                    "skipped_dup": skipped,
                    "errors": errors,
                    "duration_seconds": duration_s,
                    "window_seconds": LISTEN_SECONDS,
                },
                "source": "etl_maritimo",
                "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
            },
            on_conflict="cache_key",
        ).execute()
    except Exception as err:
        log.warning("health record falhou: %s", err)


def main() -> None:
    start = time.time()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    snapshots = asyncio.run(collect_vessels())
    if not snapshots:
        record_health(
            supabase,
            status="empty",
            total=0,
            inserted=0,
            skipped=0,
            errors=0,
            duration_s=time.time() - start,
        )
        log.info("nenhum navio com posicao na janela — possivel pouco trafego ou problema com a key")
        return

    inserted, skipped, errors = insert_with_dedupe(supabase, snapshots)
    log.info("inserted=%d skipped_dup=%d errors=%d", inserted, skipped, errors)

    purge_old(supabase)

    duration = time.time() - start
    status = "error" if errors > inserted else ("partial" if errors else "success")
    record_health(
        supabase,
        status=status,
        total=len(snapshots),
        inserted=inserted,
        skipped=skipped,
        errors=errors,
        duration_s=duration,
    )
    log.info("done em %.1fs status=%s", duration, status)


if __name__ == "__main__":
    main()
