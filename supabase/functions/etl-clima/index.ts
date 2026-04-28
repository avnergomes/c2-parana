// supabase/functions/etl-clima/index.ts
// Climate ETL: Open-Meteo API -> climate_data.
//
// Versao Edge Function da etl_clima.py focada em Open-Meteo (que e
// confiavel, gratis, sem auth). INMET fica fora desta migracao porque
// o WAF deles frequentemente retorna 204/HTML em ambientes serverless
// (era ja flaky em GH Actions e usava Open-Meteo como fallback).
//
// Schedule: a cada 15min via pg_cron. Trade-off: Open-Meteo atualiza
// a cada hora, mas pollar mais frequente garante que mudancas de
// estacao chegam ao mapa em <15min mesmo se 1 run falhar.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StationMeta {
  code: string
  name: string
  municipality: string
  ibge: string
  lat: number
  lon: number
}

const PR_STATIONS: StationMeta[] = [
  { code: 'A807', name: 'Curitiba', municipality: 'Curitiba', ibge: '4106902', lat: -25.434, lon: -49.266 },
  { code: 'A834', name: 'Londrina', municipality: 'Londrina', ibge: '4113700', lat: -23.363, lon: -51.190 },
  { code: 'A820', name: 'Maringá', municipality: 'Maringá', ibge: '4115200', lat: -23.403, lon: -51.999 },
  { code: 'A843', name: 'Cascavel', municipality: 'Cascavel', ibge: '4104808', lat: -24.957, lon: -53.455 },
  { code: 'A847', name: 'Foz do Iguaçu', municipality: 'Foz do Iguaçu', ibge: '4108304', lat: -25.535, lon: -54.604 },
  { code: 'A823', name: 'Ponta Grossa', municipality: 'Ponta Grossa', ibge: '4119905', lat: -25.093, lon: -50.166 },
  { code: 'A840', name: 'Guarapuava', municipality: 'Guarapuava', ibge: '4109401', lat: -25.388, lon: -51.508 },
  { code: 'A835', name: 'Apucarana', municipality: 'Apucarana', ibge: '4101303', lat: -23.554, lon: -51.437 },
  { code: 'A865', name: 'Paranaguá', municipality: 'Paranaguá', ibge: '4118204', lat: -25.526, lon: -48.525 },
  { code: 'A836', name: 'Campo Mourão', municipality: 'Campo Mourão', ibge: '4104402', lat: -24.044, lon: -52.393 },
  { code: 'A851', name: 'Toledo', municipality: 'Toledo', ibge: '4127700', lat: -24.718, lon: -53.745 },
  { code: 'A826', name: 'Umuarama', municipality: 'Umuarama', ibge: '4128104', lat: -23.767, lon: -53.330 },
]

interface ClimateRecord {
  station_code: string
  station_name: string
  municipality: string
  ibge_code: string
  latitude: number
  longitude: number
  temperature: number | null
  humidity: number | null
  pressure: number | null
  wind_speed: number | null
  wind_direction: number | null
  precipitation: number | null
  observed_at: string
}

function formatTimestamp(t: string): string {
  if (!t) return ''
  if (t.includes('T') && t.includes('-03:00')) return t
  if (t.includes('T')) return t + '-03:00'
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t + 'T00:00:00-03:00'
  return t + '-03:00'
}

async function fetchStation(meta: StationMeta): Promise<ClimateRecord[]> {
  const params = new URLSearchParams({
    latitude: String(meta.lat),
    longitude: String(meta.lon),
    hourly: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation',
    current: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation',
    timezone: 'America/Sao_Paulo',
    past_days: '2',
    forecast_days: '0',
  })
  const url = `https://api.open-meteo.com/v1/forecast?${params}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (resp.status === 429 || resp.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        continue
      }
      if (!resp.ok) {
        console.error(`Open-Meteo HTTP ${resp.status} for ${meta.code}`)
        return []
      }
      const data = (await resp.json()) as Record<string, unknown>
      const hourly = (data.hourly as Record<string, unknown[]>) ?? {}
      const times = (hourly.time as string[]) ?? []
      if (times.length === 0) return []

      const records: ClimateRecord[] = []
      const temps = hourly.temperature_2m as (number | null)[] | undefined
      const hums = hourly.relative_humidity_2m as (number | null)[] | undefined
      const press = hourly.surface_pressure as (number | null)[] | undefined
      const winds = hourly.wind_speed_10m as (number | null)[] | undefined
      const dirs = hourly.wind_direction_10m as (number | null)[] | undefined
      const prec = hourly.precipitation as (number | null)[] | undefined

      for (let i = 0; i < times.length; i++) {
        const windKmh = winds?.[i] ?? null
        const windMs = windKmh !== null ? Math.round((windKmh / 3.6) * 10) / 10 : null
        const dir = dirs?.[i] ?? null

        records.push({
          station_code: meta.code,
          station_name: meta.name,
          municipality: meta.municipality,
          ibge_code: meta.ibge,
          latitude: meta.lat,
          longitude: meta.lon,
          temperature: temps?.[i] ?? null,
          humidity: hums?.[i] ?? null,
          pressure: press?.[i] ?? null,
          wind_speed: windMs,
          wind_direction: dir !== null ? Math.round(dir) : null,
          precipitation: prec?.[i] ?? null,
          observed_at: formatTimestamp(times[i]),
        })
      }
      // Ultimas 48h ja sao retornadas pelo past_days=2
      return records
    } catch (err) {
      console.warn(`fetch ${meta.code} attempt ${attempt + 1}: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  return []
}

async function fetchAllStations(): Promise<ClimateRecord[]> {
  // Fetch em paralelo (12 stations) — Open-Meteo aguenta facilmente
  const results = await Promise.all(PR_STATIONS.map((s) => fetchStation(s)))
  const all = results.flat()
  console.log(
    `clima: ${all.length} registros (${results.filter((r) => r.length > 0).length}/${PR_STATIONS.length} estacoes)`,
  )
  return all
}

interface InsertCounters {
  inserted: number
  skipped: number
  errors: number
}

// deno-lint-ignore no-explicit-any
async function insertWithDedupe(supabase: any, records: ClimateRecord[]): Promise<InsertCounters> {
  const counters: InsertCounters = { inserted: 0, skipped: 0, errors: 0 }
  // Upsert em chunks por (station_code, observed_at) — climate_data tem
  // UNIQUE nessa combinacao. Mais rapido que insert um a um.
  const CHUNK = 100
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('climate_data')
      .upsert(chunk, { onConflict: 'station_code,observed_at', count: 'estimated' })
    if (error) {
      counters.errors += chunk.length
      console.error(`upsert chunk err: ${error.message}`)
    } else {
      counters.inserted += count ?? chunk.length
    }
  }
  return counters
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
    cache_key: 'etl_health_clima',
    data: {
      last_run: new Date().toISOString(),
      status,
      total_records: total,
      inserted: counters.inserted,
      errors: counters.errors,
      duration_seconds: durationMs / 1000,
      stations: PR_STATIONS.length,
      runtime: 'supabase-edge',
      source: 'open-meteo',
    },
    source: 'etl_clima',
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
  const supabase = createClient(supabaseUrl, serviceKey)

  const records = await fetchAllStations()
  if (records.length === 0) {
    await recordHealth(supabase, 'empty', 0, { inserted: 0, skipped: 0, errors: 0 }, Date.now() - startMs)
    return new Response(
      JSON.stringify({ status: 'empty', total: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const counters = await insertWithDedupe(supabase, records)
  const status = counters.errors > 0 ? 'partial' : 'success'
  await recordHealth(supabase, status, records.length, counters, Date.now() - startMs)

  return new Response(
    JSON.stringify({ status, total: records.length, ...counters, duration_ms: Date.now() - startMs }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
