// supabase/functions/etl-meteo-grade/index.ts
// Grade meteorologica do PR: Open-Meteo (minutely_15) -> data_cache.
//
// Consumidor: DGP Comando (camadas de ventos e precipitacao), que le
// `meteo_grade_pr` com a anon key em vez de chamar a Open-Meteo por
// visitante. Detalhes de formato e da economia de cota em grid.ts.
//
// Schedule: a cada 30 min via pg_cron (migration 042). A API so e chamada
// quando a previsao guardada nao cobre a proxima meia hora ou passou de
// 110 min; nos demais runs o job apenas avanca o slot vigente.

import {
  fetchJson,
  readCache,
  runEtl,
  sleep,
  upsertCache,
  type RunResult,
  type SupabaseClient,
} from '../_shared/etl.ts'
import {
  assembleForecast,
  buildChunkUrl,
  buildGridPoints,
  CHUNK_SIZE,
  type Forecast,
  needsApiRefresh,
  selectCurrentGrid,
} from './grid.ts'

const CURRENT_KEY = 'meteo_grade_pr'
const FORECAST_KEY = 'meteo_grade_pr_forecast'
const SOURCE = 'etl_meteo_grade'

async function fetchForecast(): Promise<{ forecast: Forecast; apiPoints: number }> {
  const points = buildGridPoints()
  const chunks: unknown[][] = []
  for (let start = 0; start < points.length; start += CHUNK_SIZE) {
    const slice = points.slice(start, start + CHUNK_SIZE)
    // Sequencial e com folga: tres lotes grandes seguidos sao o pico de cota.
    if (start > 0) await sleep(1500)
    const data = await fetchJson<unknown>(buildChunkUrl(slice), { timeoutMs: 30_000, retries: 3 })
    chunks.push(Array.isArray(data) ? data : [data])
  }
  return { forecast: assembleForecast(chunks, new Date()), apiPoints: points.length }
}

async function refreshIfNeeded(
  client: SupabaseClient,
  nowMs: number,
): Promise<{ forecast: Forecast; apiPoints: number; reused: boolean; apiError: string | null }> {
  let stored: Forecast | null = null
  try {
    stored = await readCache<Forecast>(client, FORECAST_KEY)
  } catch (err) {
    console.warn(`meteo-grade: leitura da previsao falhou: ${(err as Error).message}`)
  }

  if (!needsApiRefresh(stored, nowMs)) {
    return { forecast: stored as Forecast, apiPoints: 0, reused: true, apiError: null }
  }

  try {
    const { forecast, apiPoints } = await fetchForecast()
    await upsertCache(client, FORECAST_KEY, SOURCE, forecast, 240, {
      width: forecast.width,
      height: forecast.height,
      slots: forecast.times.length,
    })
    return { forecast, apiPoints, reused: false, apiError: null }
  } catch (err) {
    // API fora (429/503): se a previsao antiga ainda cobre agora, segue com ela.
    const message = (err as Error).message
    if (stored) {
      try {
        selectCurrentGrid(stored, nowMs)
        return { forecast: stored, apiPoints: 0, reused: true, apiError: message }
      } catch {
        // antiga nao cobre o horario: cai no throw abaixo
      }
    }
    throw new Error(`Open-Meteo indisponivel e sem previsao valida: ${message}`)
  }
}

Deno.serve((req: Request) =>
  runEtl(req, 'meteo_grade', async (client): Promise<RunResult> => {
    const nowMs = Date.now()
    const { forecast, apiPoints, reused, apiError } = await refreshIfNeeded(client, nowMs)
    const current = selectCurrentGrid(forecast, nowMs)

    // TTL de 75 min: o DGP trata linha expirada como ausente e cai no fallback.
    await upsertCache(client, CURRENT_KEY, SOURCE, current, 75, {
      width: current.width,
      height: current.height,
      observed_at: current.observed_at,
    })

    const wet = current.precip.filter((mm) => mm > 0).length
    return {
      status: apiError ? 'partial' : 'success',
      observed_at: current.observed_at,
      forecast_fetched_at: forecast.fetched_at,
      reused_forecast: reused,
      api_points: apiPoints,
      points: current.u.length,
      wet_cells: wet,
      ...(apiError ? { api_error: apiError } : {}),
      source: 'open-meteo',
    }
  })
)
