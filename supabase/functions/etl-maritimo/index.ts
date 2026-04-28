// supabase/functions/etl-maritimo/index.ts
// Maritime traffic ETL: AISStream.io WebSocket -> maritime_traffic.
//
// Equivalente Deno do scripts/etl_maritimo.py. Edge Function suporta
// WebSocket nativo do Deno; abrimos por uma janela curta (~90s),
// agregamos posicoes e fazemos batch insert.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream'
// BBox costa PR + aproximacao Atlantica (mesma do ETL Python)
const PR_MARITIME_BBOX = [[[-27.5, -49.0], [-23.5, -45.0]]]
const LISTEN_SECONDS = 90
const RETENTION_DAYS = 7

const SHIP_TYPE_LABELS: Record<number, string> = {
  0: 'Not available', 20: 'WIG', 30: 'Fishing', 31: 'Towing', 32: 'Towing > 200m',
  33: 'Dredging', 34: 'Diving', 35: 'Military', 36: 'Sailing', 37: 'Pleasure',
  40: 'High-speed craft', 50: 'Pilot', 51: 'Search and rescue', 52: 'Tug',
  53: 'Port tender', 54: 'Anti-pollution', 55: 'Law enforcement', 58: 'Medical transport',
  60: 'Passenger', 70: 'Cargo', 71: 'Cargo (HazA)', 72: 'Cargo (HazB)', 73: 'Cargo (HazC)',
  74: 'Cargo (HazD)', 80: 'Tanker', 81: 'Tanker (HazA)', 82: 'Tanker (HazB)',
  83: 'Tanker (HazC)', 84: 'Tanker (HazD)', 90: 'Other',
}

const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Under way using engine', 1: 'At anchor', 2: 'Not under command',
  3: 'Restricted manoeuverability', 4: 'Constrained by draught', 5: 'Moored',
  6: 'Aground', 7: 'Engaged in fishing', 8: 'Under way sailing', 15: 'Undefined',
}

function shipTypeLabel(code: number | null): string | null {
  if (code === null) return null
  if (SHIP_TYPE_LABELS[code]) return SHIP_TYPE_LABELS[code]
  if (code >= 70 && code <= 79) return 'Cargo'
  if (code >= 80 && code <= 89) return 'Tanker'
  if (code >= 60 && code <= 69) return 'Passenger'
  return 'Other'
}

interface VesselSnapshot {
  mmsi: number
  imo?: number | null
  vessel_name?: string | null
  callsign?: string | null
  ship_type?: number | null
  latitude?: number
  longitude?: number
  sog_knots?: number | null
  cog_deg?: number | null
  heading_deg?: number | null
  nav_status?: number | null
  destination?: string | null
  eta?: string | null
  draught_m?: number | null
  length_m?: number | null
  width_m?: number | null
  observed_at?: string
}

const GO_TIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*([+-]\d{4})?(?:\s+\w+)?$/

function parseAisTime(value: string): Date {
  const iso = value.replace('Z', '+00:00')
  const d1 = new Date(iso)
  if (!isNaN(d1.getTime())) return d1
  const m = GO_TIME_RE.exec(value.trim())
  if (!m) throw new Error(`Cannot parse AIS time: ${value}`)
  const [, datePart, timePart, frac, offset] = m
  const fracPart = frac ? '.' + (frac + '000000').slice(0, 6) : ''
  const offsetIso = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : '+00:00'
  return new Date(`${datePart}T${timePart}${fracPart}${offsetIso}`)
}

function truncateToMinute(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? parseAisTime(dateOrIso) : dateOrIso
  d.setUTCSeconds(0, 0)
  return d.toISOString()
}

function ingestPosition(snap: VesselSnapshot, msg: Record<string, unknown>, meta: Record<string, unknown>) {
  const lat = msg.Latitude
  const lon = msg.Longitude
  if (typeof lat === 'number') snap.latitude = lat
  if (typeof lon === 'number') snap.longitude = lon
  const sog = msg.Sog
  snap.sog_knots = typeof sog === 'number' ? sog : null
  const cog = msg.Cog
  snap.cog_deg = typeof cog === 'number' ? cog : null
  const heading = msg.TrueHeading
  if (typeof heading === 'number' && heading !== 511) snap.heading_deg = heading
  const nav = msg.NavigationalStatus
  if (typeof nav === 'number') snap.nav_status = nav
  const ts = meta.time_utc
  if (typeof ts === 'string') snap.observed_at = ts
}

function ingestStatic(snap: VesselSnapshot, msg: Record<string, unknown>) {
  const imo = msg.ImoNumber
  if (typeof imo === 'number' && imo > 0) snap.imo = imo
  const name = msg.Name
  if (typeof name === 'string' && name.trim()) snap.vessel_name = name.trim()
  const cs = msg.CallSign
  if (typeof cs === 'string' && cs.trim()) snap.callsign = cs.trim()
  const type = msg.Type
  if (typeof type === 'number') snap.ship_type = type
  const dest = msg.Destination
  if (typeof dest === 'string' && dest.trim()) snap.destination = dest.trim()
  const eta = msg.Eta
  if (eta) snap.eta = String(eta)
  const draught = msg.MaximumStaticDraught
  if (typeof draught === 'number' && draught > 0) snap.draught_m = draught
  const dim = msg.Dimension as Record<string, unknown> | undefined
  if (dim && typeof dim === 'object') {
    const a = (dim.A as number) || 0
    const b = (dim.B as number) || 0
    const c = (dim.C as number) || 0
    const d = (dim.D as number) || 0
    if (a + b > 0) snap.length_m = Math.round(a + b)
    if (c + d > 0) snap.width_m = Math.round(c + d)
  }
}

function vesselToRow(v: VesselSnapshot): Record<string, unknown> {
  return {
    mmsi: v.mmsi,
    imo: v.imo ?? null,
    vessel_name: v.vessel_name ?? null,
    callsign: v.callsign ?? null,
    ship_type: v.ship_type ?? null,
    ship_type_label: shipTypeLabel(v.ship_type ?? null),
    latitude: v.latitude!,
    longitude: v.longitude!,
    sog_knots: v.sog_knots ?? null,
    cog_deg: v.cog_deg ?? null,
    heading_deg: v.heading_deg ?? null,
    nav_status: v.nav_status ?? null,
    nav_status_label: v.nav_status !== null && v.nav_status !== undefined ? NAV_STATUS_LABELS[v.nav_status] ?? null : null,
    destination: v.destination ?? null,
    eta: v.eta ?? null,
    draught_m: v.draught_m ?? null,
    length_m: v.length_m ?? null,
    width_m: v.width_m ?? null,
    source: 'aisstream',
    observed_at: v.observed_at ? truncateToMinute(v.observed_at) : new Date().toISOString(),
  }
}

async function collectVessels(apiKey: string, windowSeconds: number): Promise<VesselSnapshot[]> {
  return await new Promise((resolve) => {
    const vessels = new Map<number, VesselSnapshot>()
    let ws: WebSocket | null = null
    let messagesReceived = 0
    let parseErrors = 0
    let subscriptionSent = false
    const deadline = Date.now() + windowSeconds * 1000

    const finalize = () => {
      try { ws?.close() } catch (_) { /* noop */ }
      const valid = Array.from(vessels.values()).filter(
        (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number',
      )
      console.log(
        `AISStream summary: subscribed=${subscriptionSent} msgs=${messagesReceived} parseErrors=${parseErrors} mmsiDistinct=${vessels.size} validPosition=${valid.length}`,
      )
      resolve(valid)
    }

    try {
      ws = new WebSocket(AISSTREAM_URL)
    } catch (err) {
      console.error(`WebSocket connect err: ${(err as Error).message}`)
      resolve([])
      return
    }

    const timer = setTimeout(finalize, windowSeconds * 1000 + 1000)

    ws.onopen = () => {
      const sub = {
        APIKey: apiKey,
        BoundingBoxes: PR_MARITIME_BBOX,
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'],
      }
      console.log(`AISStream onopen — sending sub bbox=${JSON.stringify(PR_MARITIME_BBOX)} keylen=${apiKey.length}`)
      try {
        ws!.send(JSON.stringify(sub))
        subscriptionSent = true
      } catch (err) {
        console.error(`send sub err: ${(err as Error).message}`)
      }
    }

    ws.onerror = (ev) => {
      const e = ev as ErrorEvent
      console.warn(`WebSocket error: type=${ev.type} msg=${e.message ?? 'none'}`)
    }

    ws.onclose = (ev) => {
      console.log(`WebSocket closed: code=${ev.code} reason=${ev.reason ?? 'none'} wasClean=${ev.wasClean}`)
      clearTimeout(timer)
      finalize()
    }

    ws.onmessage = (ev) => {
      messagesReceived++
      if (messagesReceived <= 3) {
        const dataType = typeof ev.data
        const preview = dataType === 'string' ? (ev.data as string).slice(0, 150) : `[${dataType}]`
        console.log(`msg #${messagesReceived} type=${dataType} preview=${preview}`)
      }
      if (Date.now() >= deadline) {
        try { ws?.close() } catch (_) { /* noop */ }
        return
      }
      try {
        const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)
        const payload = JSON.parse(raw) as Record<string, unknown>
        if (payload.error) {
          console.error(`AISStream err frame: ${JSON.stringify(payload.error)}`)
          return
        }
        const meta = (payload.MetaData as Record<string, unknown>) || {}
        const mmsi = meta.MMSI
        if (typeof mmsi !== 'number') return

        let snap = vessels.get(mmsi)
        if (!snap) {
          snap = { mmsi }
          vessels.set(mmsi, snap)
        }

        const shipName = meta.ShipName
        if (typeof shipName === 'string' && shipName.trim() && !snap.vessel_name) {
          snap.vessel_name = shipName.trim()
        }

        const msgType = payload.MessageType as string
        const msgWrap = payload.Message as Record<string, unknown> | undefined
        const msgBody = (msgWrap?.[msgType] as Record<string, unknown>) || {}

        if (msgType === 'PositionReport' || msgType === 'StandardClassBPositionReport') {
          ingestPosition(snap, msgBody, meta)
        } else if (msgType === 'ShipStaticData') {
          ingestStatic(snap, msgBody)
        }
      } catch (err) {
        parseErrors++
        if (parseErrors <= 2) console.warn(`parse err: ${(err as Error).message}`)
      }
    }
  })
}

interface InsertCounters {
  inserted: number
  skipped: number
  errors: number
}

// deno-lint-ignore no-explicit-any
async function insertWithDedupe(supabase: any, vessels: VesselSnapshot[]): Promise<InsertCounters> {
  const counters: InsertCounters = { inserted: 0, skipped: 0, errors: 0 }
  for (const v of vessels) {
    const row = vesselToRow(v)
    const { error } = await supabase.from('maritime_traffic').insert(row)
    if (!error) {
      counters.inserted++
      continue
    }
    const msg = (error.message ?? '').toLowerCase()
    if (msg.includes('duplicate key') || error.code === '23505') {
      counters.skipped++
    } else {
      counters.errors++
      console.error(`insert err: ${error.message}`)
    }
  }
  return counters
}

// deno-lint-ignore no-explicit-any
async function purgeOld(supabase: any) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('maritime_traffic').delete().lt('observed_at', cutoff)
  if (error) console.warn(`purge err: ${error.message}`)
}

async function recordHealth(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  status: string,
  total: number,
  counters: InsertCounters,
  durationMs: number,
) {
  const payload = {
    cache_key: 'etl_health_maritimo',
    data: {
      last_run: new Date().toISOString(),
      status,
      total_vessels: total,
      inserted: counters.inserted,
      skipped_dup: counters.skipped,
      errors: counters.errors,
      duration_seconds: durationMs / 1000,
      window_seconds: LISTEN_SECONDS,
      runtime: 'supabase-edge',
    },
    source: 'etl_maritimo',
    fetched_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('data_cache').upsert(payload, { onConflict: 'cache_key' })
  if (error) console.warn(`health err: ${error.message}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startMs = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const apiKey = Deno.env.get('AISSTREAM_API_KEY')

  if (!apiKey) {
    return new Response(
      JSON.stringify({ status: 'error', error: 'AISSTREAM_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const vessels = await collectVessels(apiKey, LISTEN_SECONDS)

  if (vessels.length === 0) {
    await recordHealth(supabase, 'empty', 0, { inserted: 0, skipped: 0, errors: 0 }, Date.now() - startMs)
    return new Response(
      JSON.stringify({ status: 'empty', total: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const counters = await insertWithDedupe(supabase, vessels)
  await purgeOld(supabase)

  const status = counters.errors > counters.inserted ? 'error' : counters.errors > 0 ? 'partial' : 'success'
  await recordHealth(supabase, status, vessels.length, counters, Date.now() - startMs)

  return new Response(
    JSON.stringify({
      status,
      total_vessels: vessels.length,
      ...counters,
      duration_ms: Date.now() - startMs,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
