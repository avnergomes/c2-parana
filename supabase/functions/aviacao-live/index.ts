// supabase/functions/aviacao-live/index.ts
//
// Trafego aereo AO VIVO para o DataGeo: busca o adsb.lol na hora e devolve
// no shape /states/all do OpenSky (contrato do flights.js). Nada vai para o
// banco. Substitui o etl-aviacao (pg_cron 1 min -> aviation_traffic), que
// gravava ~700 linhas/min com 7 dias de retencao e era o maior consumidor de
// disk IO do projeto (2026-10-28).
//
// O adsb.lol nao manda CORS, por isso o navegador nao le direto.
// Limite do adsb.lol: 1 req/s e 60/min por IP; o cache por isolate junta os
// polls de varios usuarios.
// ponytail: cache so dentro do isolate; se o 429 aparecer com muitos
// usuarios, guardar o ultimo snapshot em data_cache (1 linha/min).

const URL = 'https://api.adsb.lol/v2/lat/-24.89/lon/-51.55/dist/250'
const USER_AGENT = 'c2-parana/1.0 (+https://github.com/avnergomes/c2-parana)'
const CACHE_MS = 10_000
const FT_TO_M = 0.3048
const KT_TO_MS = 0.514444
const FTMIN_TO_MS = 0.00508

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}
const alt = (v: unknown): number | null =>
  v === 'ground' ? 0 : (num(v) === null ? null : num(v)! * FT_TO_M)
const category = (v: unknown): number =>
  typeof v === 'string' && /^[A-D]\d$/i.test(v) ? parseInt(v[1], 10) : 0

function toState(r: Record<string, unknown>, nowSec: number): unknown[] | null {
  if (typeof r.hex !== 'string' || typeof r.lat !== 'number' || typeof r.lon !== 'number') return null
  const seen = num(r.seen_pos)
  const t = seen !== null && seen < 60 ? Math.round(nowSec - seen) : nowSec
  const gs = num(r.gs)
  const vr = num(r.baro_rate ?? r.geom_rate)
  return [
    r.hex.trim().toLowerCase(),
    typeof r.flight === 'string' ? r.flight.trim() : '',
    typeof r.r === 'string' ? r.r : '',
    t, t,
    r.lon, r.lat,
    alt(r.alt_baro),
    r.alt_baro === 'ground' || r.ground === true,
    gs === null ? null : gs * KT_TO_MS,
    num(r.track),
    vr === null ? null : vr * FTMIN_TO_MS,
    null,
    alt(r.alt_geom),
    typeof r.squawk === 'string' ? r.squawk : null,
    false, 0,
    category(r.category),
  ]
}

let cache: { at: number; body: string } | null = null
let inflight: Promise<string> | null = null

async function snapshot(): Promise<string> {
  const resp = await fetch(URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!resp.ok) throw new Error(`adsb.lol HTTP ${resp.status}`)
  const payload = (await resp.json()) as { ac?: Array<Record<string, unknown>> }
  const nowSec = Math.floor(Date.now() / 1000)
  const states = (payload.ac ?? []).map((r) => toState(r, nowSec)).filter(Boolean)
  return JSON.stringify({ time: nowSec, states })
}

// O gateway ja validou a assinatura do JWT; aqui so barra a anon key.
function logado(req: Request): boolean {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return claims.role === 'authenticated'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!logado(req)) return new Response('{"error":"login"}', { status: 401, headers: CORS })
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      inflight ??= snapshot().finally(() => { inflight = null })
      cache = { at: Date.now(), body: await inflight }
    }
    return new Response(cache.body, { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error((err as Error).message)
    // Snapshot velho (< 2 min) e melhor que mapa vazio num 429 passageiro.
    if (cache && Date.now() - cache.at < 120_000) {
      return new Response(cache.body, { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    return new Response('{"error":"fonte"}', { status: 502, headers: CORS })
  }
})
