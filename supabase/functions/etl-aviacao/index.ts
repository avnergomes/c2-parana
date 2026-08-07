// supabase/functions/etl-aviacao/index.ts
// Aviation traffic ETL: airplanes.live -> aviation_traffic.
//
// Equivalente Deno do scripts/etl_aviacao.py. Roda em Supabase Edge
// Runtime, agendado via pg_cron + pg_net a cada 1min (mais confiavel
// que GH Actions cron, que estava jitterando ate 90min).
//
// Auth: header x-etl-token (ver _shared/etl.ts). Escrita usa
// SUPABASE_SERVICE_ROLE_KEY via env interno do edge runtime.

import {
  batchUpsert,
  runEtl,
  type RunResult,
  type SupabaseClient,
} from '../_shared/etl.ts'

const PR_CENTER_LAT = -24.89
const PR_CENTER_LON = -51.55
const RADIUS_NM = 250
const URL = `https://api.airplanes.live/v2/point/${PR_CENTER_LAT}/${PR_CENTER_LON}/${RADIUS_NM}`
const USER_AGENT = 'c2-parana/1.0 (+https://github.com/avnergomes/c2-parana)'
const RETENTION_DAYS = 7

const FT_TO_M = 0.3048
const KT_TO_MS = 0.514444
const FTMIN_TO_MS = 0.00508

interface AircraftRecord {
  icao24: string
  callsign: string | null
  origin_country: string | null
  latitude: number
  longitude: number
  baro_altitude_m: number | null
  geo_altitude_m: number | null
  velocity_ms: number | null
  true_track: number | null
  vertical_rate_ms: number | null
  on_ground: boolean
  squawk: string | null
  category: number | null
  source: string
  observed_at: string
}

function parseAlt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'ground') return 0
    const n = parseFloat(v)
    return isNaN(n) ? null : n * FT_TO_M
  }
  if (typeof v === 'number') return v * FT_TO_M
  return null
}

function safeFloat(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

function parseCategory(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Math.trunc(v)
  if (typeof v === 'string' && v.length >= 2 && v[0].toUpperCase() === 'A') {
    const n = parseInt(v[1], 10)
    return isNaN(n) ? null : n
  }
  return null
}

function truncateToMinute(iso: string): string {
  const d = new Date(iso)
  d.setUTCSeconds(0, 0)
  return d.toISOString()
}

function parseAircraft(rec: Record<string, unknown>, snapshotIso: string): AircraftRecord | null {
  const icao24 = rec.hex
  const lat = rec.lat
  const lon = rec.lon
  if (typeof icao24 !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
    return null
  }

  const flightRaw = rec.flight
  const callsign =
    typeof flightRaw === 'string' && flightRaw.trim().length > 0 ? flightRaw.trim() : null

  const altBaroRaw = rec.alt_baro
  const onGround =
    (typeof altBaroRaw === 'string' && altBaroRaw.toLowerCase() === 'ground') ||
    rec.ground === true

  let observedAt = snapshotIso
  const seenPos = rec.seen_pos
  if (typeof seenPos === 'number' && seenPos < 60) {
    const d = new Date(new Date(snapshotIso).getTime() - Math.round(seenPos) * 1000)
    observedAt = d.toISOString()
  }

  const velocityKt = safeFloat(rec.gs)
  const velocityMs = velocityKt !== null ? velocityKt * KT_TO_MS : null

  const vrate = safeFloat(rec.baro_rate ?? rec.geom_rate)
  const verticalRateMs = vrate !== null ? vrate * FTMIN_TO_MS : null

  return {
    icao24: icao24.trim().toLowerCase(),
    callsign,
    origin_country: typeof rec.r === 'string' ? rec.r : null,
    latitude: lat,
    longitude: lon,
    baro_altitude_m: parseAlt(altBaroRaw),
    geo_altitude_m: parseAlt(rec.alt_geom),
    velocity_ms: velocityMs,
    true_track: safeFloat(rec.track),
    vertical_rate_ms: verticalRateMs,
    on_ground: onGround,
    squawk: typeof rec.squawk === 'string' ? rec.squawk : null,
    category: parseCategory(rec.category),
    source: 'airplanes.live',
    observed_at: observedAt,
  }
}

async function fetchAirplanesLive(): Promise<AircraftRecord[]> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(URL, { headers, signal: AbortSignal.timeout(25000) })
      if (resp.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      if (resp.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      if (!resp.ok) {
        console.error(`airplanes.live HTTP ${resp.status}`)
        return []
      }
      const payload = (await resp.json()) as { ac?: Array<Record<string, unknown>> }
      const snapshotIso = new Date().toISOString()
      const ac = payload.ac ?? []
      const parsed: AircraftRecord[] = []
      for (const rec of ac) {
        const p = parseAircraft(rec, snapshotIso)
        if (p) parsed.push(p)
      }
      console.log(`airplanes.live: ${ac.length} received, ${parsed.length} valid`)
      return parsed
    } catch (err) {
      console.warn(`fetch attempt ${attempt + 1} failed: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  console.error('airplanes.live failed after 3 retries')
  return []
}

function dedupeByMinute(records: AircraftRecord[]): AircraftRecord[] {
  const seen = new Map<string, AircraftRecord>()
  for (const r of records) {
    const minute = truncateToMinute(r.observed_at)
    const key = `${r.icao24}|${minute}`
    seen.set(key, { ...r, observed_at: minute })
  }
  return Array.from(seen.values())
}

async function purgeOld(client: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await client.from('aviation_traffic').delete().lt('observed_at', cutoff)
  if (error) console.warn(`purge err: ${error.message}`)
}

Deno.serve((req: Request) =>
  runEtl(req, 'aviacao', async (client): Promise<RunResult> => {
    const states = await fetchAirplanesLive()
    if (states.length === 0) {
      return { status: 'empty', total_received: 0, inserted: 0, source: 'airplanes.live' }
    }

    // aviation_traffic tem UNIQUE (icao24, observed_at). O dedupe em memoria ja
    // colapsa as leituras do mesmo minuto; o upsert cobre o resto (execucoes
    // sobrepostas dos 3 schedules com offset da migration 031).
    const deduped = dedupeByMinute(states)
    const result = await batchUpsert(
      client,
      'aviation_traffic',
      deduped as unknown as Record<string, unknown>[],
      'icao24,observed_at',
      500,
    )
    await purgeOld(client)

    return {
      status: result.errors > 0 ? 'partial' : 'success',
      total_received: states.length,
      deduped: deduped.length,
      inserted: result.inserted,
      errors: result.errors,
      source: 'airplanes.live',
    }
  })
)
