// supabase/functions/public-api/index.ts
//
// DataGeo PR — superfície de API pública.
//
// Autenticação:  header  Authorization: Bearer dgp_live_XXXXXXXXXXXXXXXX
// Quota:         enforced via check_api_quota() (migration 033)
// Logging:       cada chamada vai para api_usage (append-only)
//
// Endpoints v1 (path relativo após /public-api/):
//   GET  /v1/health
//   GET  /v1/clima/atual?ibge=4106902
//   GET  /v1/clima/atual?station=A807
//   GET  /v1/queimadas?from=YYYY-MM-DD&to=YYYY-MM-DD&ibge=...
//   GET  /v1/dengue/municipio/{ibge}?year=2026&week=15
//   GET  /v1/alertas?ativos=true&severity=high
//   GET  /v1/irtc/{ibge}
//
// Respostas seguem o envelope { success, data, error, meta? }.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const ALLOWED_ORIGINS = (Deno.env.get('CORS_ORIGINS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allow = ALLOWED_ORIGINS.length === 0
    ? '*'
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

function json(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...extraHeaders },
  })
}

function ok<T>(req: Request, data: T, meta?: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return json(req, { success: true, data, ...(meta ? { meta } : {}) }, 200, extraHeaders)
}

function err(req: Request, status: number, message: string, extraHeaders: Record<string, string> = {}) {
  return json(req, { success: false, error: message }, status, extraHeaders)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface QuotaRow {
  api_key_id: string
  user_id: string
  plan: string
  status: string
  monthly_limit: number
  used_this_month: number
  remaining: number
}

async function authenticate(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ quota: QuotaRow; rawKey: string } | { error: Response }> {
  const authHeader = req.headers.get('Authorization') || ''
  const m = authHeader.match(/^Bearer\s+(\S+)$/)
  if (!m) {
    return { error: err(req, 401, 'Missing Authorization: Bearer <api_key>') }
  }
  const rawKey = m[1]
  if (!rawKey.startsWith('dgp_')) {
    return { error: err(req, 401, 'Invalid API key format') }
  }
  const hash = await sha256Hex(rawKey)
  const { data, error: rpcErr } = await supabase
    .rpc('check_api_quota', { p_key_hash: hash })
    .maybeSingle()
  if (rpcErr) {
    console.error('check_api_quota error:', rpcErr)
    return { error: err(req, 500, 'Quota check failed') }
  }
  if (!data) {
    return { error: err(req, 401, 'Invalid or revoked API key') }
  }
  const quota = data as QuotaRow
  if (quota.remaining <= 0) {
    return {
      error: err(req, 429, `Monthly quota exceeded (${quota.used_this_month}/${quota.monthly_limit}). Upgrade your plan or wait until next month.`, {
        'X-RateLimit-Limit': String(quota.monthly_limit),
        'X-RateLimit-Remaining': '0',
      }),
    }
  }
  return { quota, rawKey }
}

async function logUsage(
  supabase: SupabaseClient,
  req: Request,
  quota: QuotaRow,
  endpoint: string,
  status: number,
  startMs: number,
): Promise<void> {
  try {
    await supabase.from('api_usage').insert({
      api_key_id: quota.api_key_id,
      user_id: quota.user_id,
      endpoint,
      method: req.method,
      status_code: status,
      response_ms: Math.round(performance.now() - startMs),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent') || null,
    })
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', quota.api_key_id)
  } catch (e) {
    console.error('logUsage failed:', e)
  }
}

// ---------- Handlers por endpoint ----------

async function handleClimaAtual(supabase: SupabaseClient, url: URL) {
  const ibge = url.searchParams.get('ibge')
  const station = url.searchParams.get('station')
  let query = supabase
    .from('climate_data')
    .select('station_code, station_name, municipality, ibge_code, latitude, longitude, temperature, humidity, pressure, wind_speed, wind_direction, precipitation, observed_at')
    .order('observed_at', { ascending: false })
    .limit(1)
  if (ibge) query = query.eq('ibge_code', ibge)
  if (station) query = query.eq('station_code', station)
  if (!ibge && !station) {
    return { status: 400, body: { error: 'ibge or station query param required' } }
  }
  const { data, error: e } = await query.maybeSingle()
  if (e) return { status: 500, body: { error: e.message } }
  if (!data) return { status: 404, body: { error: 'No observation found' } }
  return { status: 200, body: data }
}

async function handleQueimadas(supabase: SupabaseClient, url: URL) {
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const ibge = url.searchParams.get('ibge')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 5000)

  let query = supabase
    .from('fire_spots')
    .select('latitude, longitude, brightness, acq_date, acq_time, satellite, confidence, municipality, ibge_code')
    .order('acq_date', { ascending: false })
    .limit(limit)
  if (from) query = query.gte('acq_date', from)
  if (to) query = query.lte('acq_date', to)
  if (ibge) query = query.eq('ibge_code', ibge)
  const { data, error: e } = await query
  if (e) return { status: 500, body: { error: e.message } }
  return { status: 200, body: data || [], meta: { count: data?.length || 0, limit } }
}

async function handleDengueMunicipio(supabase: SupabaseClient, ibge: string, url: URL) {
  const year = url.searchParams.get('year')
  const week = url.searchParams.get('week')
  let query = supabase
    .from('dengue_data')
    .select('ibge_code, municipality_name, year, epidemiological_week, cases, cases_est, alert_level, incidence_rate, population')
    .eq('ibge_code', ibge)
    .order('year', { ascending: false })
    .order('epidemiological_week', { ascending: false })
    .limit(52)
  if (year) query = query.eq('year', parseInt(year, 10))
  if (week) query = query.eq('epidemiological_week', parseInt(week, 10))
  const { data, error: e } = await query
  if (e) return { status: 500, body: { error: e.message } }
  return { status: 200, body: data || [], meta: { count: data?.length || 0 } }
}

async function handleAlertas(supabase: SupabaseClient, url: URL) {
  const ativos = url.searchParams.get('ativos') !== 'false'
  const severity = url.searchParams.get('severity')
  let query = supabase
    .from('alerts')
    .select('id, source, severity, title, description, affected_municipalities, starts_at, ends_at, is_active')
    .order('starts_at', { ascending: false })
    .limit(200)
  if (ativos) query = query.eq('is_active', true)
  if (severity) query = query.eq('severity', severity)
  const { data, error: e } = await query
  if (e) return { status: 500, body: { error: e.message } }
  return { status: 200, body: data || [], meta: { count: data?.length || 0 } }
}

async function handleIrtc(supabase: SupabaseClient, ibge: string) {
  const { data, error: e } = await supabase
    .from('irtc_scores')
    .select('*')
    .eq('ibge_code', ibge)
    .maybeSingle()
  if (e) return { status: 500, body: { error: e.message } }
  if (!data) return { status: 404, body: { error: 'IRTC score not found for this município' } }
  return { status: 200, body: data }
}

// ---------- Router ----------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const url = new URL(req.url)
  // Edge functions são montadas em /functions/v1/public-api — extraímos o path "depois".
  const pathname = url.pathname.replace(/^.*?\/public-api/, '') || '/'

  if (pathname === '/v1/health' || pathname === '/health') {
    return ok(req, { status: 'ok', service: 'datageo-pr-api', version: 'v1' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const auth = await authenticate(supabase, req)
  if ('error' in auth) return auth.error
  const { quota } = auth
  const startMs = performance.now()

  const rateHeaders: Record<string, string> = {
    'X-RateLimit-Limit': String(quota.monthly_limit),
    'X-RateLimit-Remaining': String(Math.max(0, quota.remaining - 1)),
    'X-RateLimit-Plan': quota.plan,
  }

  let result: { status: number; body: unknown; meta?: Record<string, unknown> }
  try {
    if (pathname === '/v1/clima/atual') {
      result = await handleClimaAtual(supabase, url)
    } else if (pathname === '/v1/queimadas') {
      result = await handleQueimadas(supabase, url)
    } else if (pathname === '/v1/alertas') {
      result = await handleAlertas(supabase, url)
    } else {
      const dengueMatch = pathname.match(/^\/v1\/dengue\/municipio\/(\d{7})$/)
      const irtcMatch = pathname.match(/^\/v1\/irtc\/(\d{7})$/)
      if (dengueMatch) {
        result = await handleDengueMunicipio(supabase, dengueMatch[1], url)
      } else if (irtcMatch) {
        result = await handleIrtc(supabase, irtcMatch[1])
      } else {
        result = { status: 404, body: { error: `Endpoint não encontrado: ${pathname}` } }
      }
    }
  } catch (e) {
    console.error('handler error:', e)
    result = { status: 500, body: { error: 'Internal error' } }
  }

  const response = result.status === 200
    ? ok(req, (result.body as unknown), { ...(result.meta || {}), plan: quota.plan }, rateHeaders)
    : err(req, result.status, (result.body as { error?: string }).error || 'Error', rateHeaders)

  // logging async (não bloqueia resposta — mas como Deno mantém isolate vivo por
  // alguns ms após o return, vale aguardar o insert para não perder eventos)
  await logUsage(supabase, req, quota, pathname, result.status, startMs)
  return response
})
