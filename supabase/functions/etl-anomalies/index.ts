// supabase/functions/etl-anomalies/index.ts
// Deteccao de anomalias estatisticas via z-score (Fase 3.F).
//
// Porte Deno de scripts/etl_anomalies.py (a especificacao). DB->DB puro:
// para cada indicador (temperature, humidity, aqi) calcula o z-score da
// observacao mais recente contra a janela rolante de 30 observacoes por
// estacao/cidade. |z| >= 3 grava em `anomalies` e emite notification.
//
// statistics.mean/stdev do Python implementados a mao (stdev AMOSTRAL, n-1,
// como statistics.stdev). Zero anomalias e resultado valido ("success").

import { runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const Z_THRESHOLD = 3.0
const WINDOW_SIZE = 30

interface Anomaly {
  domain: string
  indicator: string
  station_code: string
  municipality: string
  observed_value: number
  z_score: number
  window_mean: number
  window_stddev: number
  window_size: number
  detected_at: string
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Desvio padrao AMOSTRAL (n-1), identico a statistics.stdev do Python. */
function sampleStdev(values: number[]): number {
  const m = mean(values)
  const ss = values.reduce((acc, v) => acc + (v - m) ** 2, 0)
  return Math.sqrt(ss / (values.length - 1))
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Avalia a serie de uma estacao; retorna a anomalia ou null. */
function evaluate(
  domain: string,
  indicator: string,
  stationCode: string,
  municipality: string,
  values: number[],
  nowIso: string,
): Anomaly | null {
  if (values.length < WINDOW_SIZE) return null
  const latest = values[0]
  const window = values.slice(1, WINDOW_SIZE + 1)
  if (window.length < 10) return null

  const m = mean(window)
  const sd = sampleStdev(window)
  if (sd < 0.01) return null

  const z = (latest - m) / sd
  if (Math.abs(z) < Z_THRESHOLD) return null

  return {
    domain,
    indicator,
    station_code: stationCode,
    municipality,
    observed_value: round2(latest),
    z_score: round2(z),
    window_mean: round2(m),
    window_stddev: round2(sd),
    window_size: window.length,
    detected_at: nowIso,
  }
}

async function detectClimateAnomalies(
  client: SupabaseClient,
  nowIso: string,
): Promise<Anomaly[]> {
  const { data, error } = await client
    .from('climate_data')
    .select('station_code,municipality,temperature,humidity,observed_at')
    .not('temperature', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(3000)
  if (error) {
    console.warn(`climate_data: ${error.message}`)
    return []
  }
  const rows = (data ?? []) as {
    station_code: string | null
    municipality: string | null
    temperature: number | null
    humidity: number | null
  }[]
  if (rows.length === 0) return []

  const anomalies: Anomaly[] = []
  for (const indicator of ['temperature', 'humidity'] as const) {
    const byStation = new Map<string, { value: number; municipality: string }[]>()
    for (const r of rows) {
      const code = r.station_code ?? ''
      const val = r[indicator]
      if (code && val !== null && val !== undefined) {
        const list = byStation.get(code) ?? []
        list.push({ value: Number(val), municipality: r.municipality ?? '' })
        byStation.set(code, list)
      }
    }
    for (const [station, obs] of byStation) {
      const anomaly = evaluate(
        'clima',
        indicator,
        station,
        obs[0].municipality,
        obs.map((o) => o.value),
        nowIso,
      )
      if (anomaly) anomalies.push(anomaly)
    }
  }
  return anomalies
}

async function detectAirQualityAnomalies(
  client: SupabaseClient,
  nowIso: string,
): Promise<Anomaly[]> {
  const { data, error } = await client
    .from('air_quality')
    .select('city,aqi,observed_at')
    .order('observed_at', { ascending: false })
    .limit(1000)
  if (error) {
    console.warn(`air_quality: ${error.message}`)
    return []
  }
  const rows = (data ?? []) as { city: string | null; aqi: number | null }[]
  if (rows.length === 0) return []

  const byCity = new Map<string, number[]>()
  for (const r of rows) {
    const city = r.city ?? ''
    if (city && r.aqi !== null && r.aqi !== undefined) {
      const list = byCity.get(city) ?? []
      list.push(Number(r.aqi))
      byCity.set(city, list)
    }
  }

  const anomalies: Anomaly[] = []
  for (const [city, values] of byCity) {
    const anomaly = evaluate('ar', 'aqi', city, city, values, nowIso)
    if (anomaly) anomalies.push(anomaly)
  }
  return anomalies
}

function buildNotifications(anomalies: Anomaly[]) {
  return anomalies.map((a) => {
    const direction = a.z_score > 0 ? 'acima' : 'abaixo'
    const unit =
      a.indicator === 'temperature' ? 'C' : a.indicator === 'humidity' ? '%' : 'AQI'
    const indicatorTitle = a.indicator.charAt(0).toUpperCase() + a.indicator.slice(1)
    return {
      channel: 'in_app',
      title: `Anomalia: ${a.indicator} ${direction} do normal em ${a.municipality}`,
      body:
        `${indicatorTitle} = ${a.observed_value}${unit} ` +
        `(z-score: ${a.z_score}, media: ${a.window_mean}${unit})`,
      severity: Math.abs(a.z_score) >= 4 ? 'high' : 'medium',
      metadata: {
        domain: a.domain,
        indicator: a.indicator,
        station_code: a.station_code,
        z_score: a.z_score,
      },
    }
  })
}

Deno.serve((req: Request) =>
  runEtl(req, 'anomalies', async (client: SupabaseClient): Promise<RunResult> => {
    const nowIso = new Date().toISOString()

    const clima = await detectClimateAnomalies(client, nowIso)
    const ar = await detectAirQualityAnomalies(client, nowIso)
    const all = [...clima, ...ar]

    let notified = 0
    if (all.length > 0) {
      const { error } = await client
        .from('anomalies')
        .upsert(all, { onConflict: 'domain,indicator,station_code,detected_at' })
      if (error) throw new Error(`anomalies upsert: ${error.message}`)

      const notifications = buildNotifications(all)
      const { error: notifError } = await client.from('notifications').insert(notifications)
      if (notifError) console.warn(`notifications: ${notifError.message}`)
      else notified = notifications.length
    }

    return {
      status: 'success',
      anomalies_detected: all.length,
      clima: clima.length,
      ar: ar.length,
      notifications: notified,
    }
  })
)
