// supabase/functions/etl-maritimo/index.ts
// Trafego maritimo: AISStream.io WebSocket -> maritime_traffic.
//
// Equivalente Deno do scripts/etl_maritimo.py. Abre o WebSocket por uma janela
// curta, agrega posicoes por MMSI e insere em lote.
//
// DIAGNOSTICO 2026-08-06: esta funcao vinha coletando 0 embarcacoes, o que o
// plano de migracao atribuiu a um bug de porte (janela de 90s vs 120s do
// Python). Verificacao no banco derrubou essa hipotese: a ultima linha em
// maritime_traffic e de 2026-08-02T09:24Z e o proprio ETL Python (rodando no
// Actions, com janela de 120s) tambem vem gravando status "empty" desde entao.
// Ou seja, os dois runtimes coletam zero: o problema esta a montante, na conta
// AISStream (chave expirada, quota estourada ou plano alterado), nao no porte.
//
// Consequencia de projeto: como o log de Edge Function so existe no dashboard,
// o health record passa a carregar os diagnosticos do WebSocket (frames
// recebidos, codigo de fechamento, primeiro frame de erro). Assim a proxima
// investigacao se resolve com uma query em data_cache.

import {
  batchUpsert,
  runEtl,
  type RunResult,
  type SupabaseClient,
} from '../_shared/etl.ts'

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream'
// BBox costa PR + aproximacao Atlantica (identica a do ETL Python)
const PR_MARITIME_BBOX = [[[-27.5, -49.0], [-23.5, -45.0]]]
const LISTEN_SECONDS = 120
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

/** Diagnostico da sessao WebSocket, embutido no health record. */
interface StreamDiagnostics {
  subscription_sent: boolean
  messages_received: number
  parse_errors: number
  mmsi_distinct: number
  close_code: number | null
  close_reason: string | null
  first_error_frame: string | null
  socket_error: string | null
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

function ingestPosition(
  snap: VesselSnapshot,
  msg: Record<string, unknown>,
  meta: Record<string, unknown>,
) {
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
    nav_status_label:
      v.nav_status !== null && v.nav_status !== undefined
        ? NAV_STATUS_LABELS[v.nav_status] ?? null
        : null,
    destination: v.destination ?? null,
    eta: v.eta ?? null,
    draught_m: v.draught_m ?? null,
    length_m: v.length_m ?? null,
    width_m: v.width_m ?? null,
    source: 'aisstream',
    observed_at: v.observed_at ? truncateToMinute(v.observed_at) : new Date().toISOString(),
  }
}

interface CollectOutcome {
  vessels: VesselSnapshot[]
  diagnostics: StreamDiagnostics
}

function collectVessels(apiKey: string, windowSeconds: number): Promise<CollectOutcome> {
  return new Promise((resolve) => {
    const vessels = new Map<number, VesselSnapshot>()
    const diagnostics: StreamDiagnostics = {
      subscription_sent: false,
      messages_received: 0,
      parse_errors: 0,
      mmsi_distinct: 0,
      close_code: null,
      close_reason: null,
      first_error_frame: null,
      socket_error: null,
    }

    let ws: WebSocket | null = null
    let settled = false
    const deadline = Date.now() + windowSeconds * 1000

    const finalize = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws?.close() } catch (_) { /* noop */ }

      diagnostics.mmsi_distinct = vessels.size
      const valid = Array.from(vessels.values()).filter(
        (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number',
      )
      console.log(`AISStream: ${JSON.stringify(diagnostics)} validPosition=${valid.length}`)
      resolve({ vessels: valid, diagnostics })
    }

    // Teto absoluto: garante que a promise resolve mesmo se o socket nunca
    // abrir nem fechar (a Edge Function tem wall-clock de ~400s).
    const timer = setTimeout(finalize, windowSeconds * 1000 + 2000)

    try {
      ws = new WebSocket(AISSTREAM_URL)
    } catch (err) {
      diagnostics.socket_error = (err as Error).message
      finalize()
      return
    }

    ws.onopen = () => {
      const sub = {
        APIKey: apiKey,
        BoundingBoxes: PR_MARITIME_BBOX,
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'],
      }
      try {
        ws!.send(JSON.stringify(sub))
        diagnostics.subscription_sent = true
      } catch (err) {
        diagnostics.socket_error = `send subscription: ${(err as Error).message}`
      }
    }

    ws.onerror = (ev) => {
      const e = ev as ErrorEvent
      diagnostics.socket_error = e.message ?? `event:${ev.type}`
    }

    ws.onclose = (ev) => {
      diagnostics.close_code = ev.code
      diagnostics.close_reason = ev.reason || null
      finalize()
    }

    ws.onmessage = (ev) => {
      diagnostics.messages_received++
      if (Date.now() >= deadline) {
        finalize()
        return
      }
      try {
        const raw = typeof ev.data === 'string'
          ? ev.data
          : new TextDecoder().decode(ev.data as ArrayBuffer)
        const payload = JSON.parse(raw) as Record<string, unknown>

        // AISStream devolve {"error": "..."} para chave invalida, quota
        // estourada ou subscription malformada. Guardar o primeiro: e a
        // resposta direta para "por que veio zero".
        if (payload.error) {
          if (!diagnostics.first_error_frame) {
            diagnostics.first_error_frame = String(
              typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error),
            ).slice(0, 500)
          }
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
        diagnostics.parse_errors++
        if (diagnostics.parse_errors <= 2) console.warn(`parse err: ${(err as Error).message}`)
      }
    }
  })
}

async function purgeOld(client: SupabaseClient) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await client.from('maritime_traffic').delete().lt('observed_at', cutoff)
  if (error) console.warn(`purge err: ${error.message}`)
}

Deno.serve((req: Request) =>
  runEtl(req, 'maritimo', async (client): Promise<RunResult> => {
    const apiKey = Deno.env.get('AISSTREAM_API_KEY')
    if (!apiKey) throw new Error('AISSTREAM_API_KEY nao configurado')

    const { vessels, diagnostics } = await collectVessels(apiKey, LISTEN_SECONDS)

    if (vessels.length === 0) {
      return {
        status: 'empty',
        total_vessels: 0,
        inserted: 0,
        window_seconds: LISTEN_SECONDS,
        diagnostics,
      }
    }

    // maritime_traffic tem UNIQUE (mmsi, observed_at) e observed_at e truncado
    // ao minuto, entao duas leituras do mesmo navio no mesmo minuto colidem.
    // O upsert transforma essa colisao esperada em update, em vez do
    // insert-e-conta-duplicata que a versao anterior fazia uma linha por vez.
    const rows = vessels.map(vesselToRow)
    const result = await batchUpsert(client, 'maritime_traffic', rows, 'mmsi,observed_at', 500)
    await purgeOld(client)

    return {
      status: result.errors > 0 ? 'partial' : 'success',
      total_vessels: vessels.length,
      inserted: result.inserted,
      errors: result.errors,
      window_seconds: LISTEN_SECONDS,
      diagnostics,
    }
  })
)
