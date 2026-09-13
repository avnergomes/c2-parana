// supabase/functions/etl-meteo-grade/grid.ts
//
// Logica pura da grade meteorologica do PR (vento a 10 m + precipitacao),
// consumida pelas camadas de ventos e precipitacao do DGP Comando.
//
// Por que no servidor: o plano gratuito da Open-Meteo limita por IP e, na
// pratica, conta cada coordenada como uma chamada. A grade 22x15 custava 330
// chamadas POR VISITANTE; visitantes atras do mesmo IP estouravam o limite
// (429/503). Aqui a Open-Meteo e consultada por um unico cliente.
//
// Por que previsao 15-minutal: o `current` da Open-Meteo e exatamente o slot
// `minutely_15` do horario (verificado em 2026-09-13). Buscando 3 h de slots
// a cada ~2 h, o job de 30 min so escolhe o slot vigente sem gastar cota:
// 12 buscas/dia x 330 pontos = 3.960 chamadas/dia, contra 15.840 se cada
// execucao consultasse a API.
//
// Convencoes do cesium-wind-layer (as mesmas do client antigo do DGP):
// arrays row-major, linha 0 = SUL, u/v em m/s, direcao meteorologica (de onde
// o vento vem).

export interface GridBounds {
  west: number
  south: number
  east: number
  north: number
}

export const GRID_BOUNDS: Readonly<GridBounds> = Object.freeze({ west: -55.0, south: -27.0, east: -48.0, north: -22.3 })
export const GRID_WIDTH = 22
export const GRID_HEIGHT = 15
export const CHUNK_SIZE = 110
export const PAST_SLOTS = 2
export const FORECAST_SLOTS = 12
export const SLOT_MS = 15 * 60_000
/** Previsao mais velha que isso e rebuscada mesmo cobrindo o horario. */
export const FORECAST_MAX_AGE_MS = 110 * 60_000

export interface GridPoint {
  lat: number
  lon: number
}

export interface Forecast {
  version: 1
  width: number
  height: number
  bounds: GridBounds
  fetched_at: string
  /** Epoch ms de cada slot (UTC). */
  times: number[]
  /** [slot][ponto] */
  speed: number[][]
  direction: number[][]
  precip: number[][]
}

export interface CurrentGrid {
  version: 1
  width: number
  height: number
  bounds: GridBounds
  observed_at: string
  fetched_at: string
  u: number[]
  v: number[]
  precip: number[]
}

/** Pontos da grade, linha 0 = sul, na mesma ordem das requisicoes. */
export function buildGridPoints(): GridPoint[] {
  const points: GridPoint[] = []
  for (let j = 0; j < GRID_HEIGHT; j++) {
    const lat = GRID_BOUNDS.south + ((GRID_BOUNDS.north - GRID_BOUNDS.south) * j) / (GRID_HEIGHT - 1)
    for (let i = 0; i < GRID_WIDTH; i++) {
      const lon = GRID_BOUNDS.west + ((GRID_BOUNDS.east - GRID_BOUNDS.west) * i) / (GRID_WIDTH - 1)
      points.push({ lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) })
    }
  }
  return points
}

/** URL de um lote de pontos, pedindo slots 15-minutais em GMT. */
export function buildChunkUrl(points: GridPoint[]): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(3)).join(','),
    longitude: points.map((p) => p.lon.toFixed(3)).join(','),
    minutely_15: 'wind_speed_10m,wind_direction_10m,precipitation',
    past_minutely_15: String(PAST_SLOTS),
    forecast_minutely_15: String(FORECAST_SLOTS),
    wind_speed_unit: 'ms',
    timezone: 'GMT',
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

const num = (x: unknown): number => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

/** "2026-09-13T13:45" em GMT -> epoch ms. */
export function parseGmtTime(t: string): number {
  return Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(t) ? t : `${t}Z`)
}

/**
 * Junta as respostas dos lotes numa previsao. Lanca se faltar ponto, se os
 * horarios divergirem entre pontos ou se vier sem slot nenhum: previsao
 * parcial deslocaria a grade e desenharia vento no lugar errado.
 */
export function assembleForecast(chunks: unknown[][], fetchedAt: Date): Forecast {
  const points = chunks.flat() as Array<Record<string, any>>
  const n = GRID_WIDTH * GRID_HEIGHT
  if (points.length !== n) throw new Error(`grade incompleta: ${points.length}/${n} pontos`)

  const timeStrings: string[] = points[0]?.minutely_15?.time ?? []
  if (timeStrings.length === 0) throw new Error('resposta sem slots minutely_15')
  const times = timeStrings.map(parseGmtTime)
  if (times.some((t) => !Number.isFinite(t))) throw new Error('horario invalido na resposta')

  const slots = times.length
  const speed = Array.from({ length: slots }, () => new Array<number>(n).fill(0))
  const direction = Array.from({ length: slots }, () => new Array<number>(n).fill(0))
  const precip = Array.from({ length: slots }, () => new Array<number>(n).fill(0))

  points.forEach((pt, k) => {
    const m = pt?.minutely_15
    if (!m || !Array.isArray(m.time) || m.time.length !== slots || m.time[0] !== timeStrings[0]) {
      throw new Error(`ponto ${k} com horarios divergentes`)
    }
    for (let s = 0; s < slots; s++) {
      speed[s][k] = num(m.wind_speed_10m?.[s])
      direction[s][k] = num(m.wind_direction_10m?.[s])
      const mm = num(m.precipitation?.[s])
      precip[s][k] = mm > 0 ? mm : 0
    }
  })

  return {
    version: 1,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    bounds: { ...GRID_BOUNDS },
    fetched_at: fetchedAt.toISOString(),
    times,
    speed,
    direction,
    precip,
  }
}

/** Indice do slot vigente: o ultimo com inicio <= agora. -1 se nenhum cobre. */
export function currentSlotIndex(forecast: Pick<Forecast, 'times'>, nowMs: number): number {
  let idx = -1
  for (let s = 0; s < forecast.times.length; s++) {
    if (forecast.times[s] <= nowMs) idx = s
    else break
  }
  if (idx < 0) return -1
  // O ultimo slot so vale durante os seus 15 min.
  if (idx === forecast.times.length - 1 && nowMs >= forecast.times[idx] + SLOT_MS) return -1
  return idx
}

/** Decide se a previsao guardada ainda serve ou se e preciso chamar a API. */
export function needsApiRefresh(forecast: Forecast | null | undefined, nowMs: number): boolean {
  if (!forecast || forecast.version !== 1) return true
  if (forecast.width !== GRID_WIDTH || forecast.height !== GRID_HEIGHT) return true
  const sameBounds = (['west', 'south', 'east', 'north'] as const)
    .every((k) => Number(forecast.bounds?.[k]) === GRID_BOUNDS[k])
  if (!sameBounds) return true
  const fetched = Date.parse(forecast.fetched_at)
  if (!Number.isFinite(fetched) || nowMs - fetched > FORECAST_MAX_AGE_MS || nowMs < fetched) return true
  // Precisa cobrir agora E a proxima meia hora, senao o proximo run fica sem slot.
  return currentSlotIndex(forecast, nowMs) < 0 || currentSlotIndex(forecast, nowMs + 30 * 60_000) < 0
}

const round2 = (x: number) => Math.round(x * 100) / 100

/** Grade do slot vigente no formato que o DGP consome. */
export function selectCurrentGrid(forecast: Forecast, nowMs: number): CurrentGrid {
  const s = currentSlotIndex(forecast, nowMs)
  if (s < 0) throw new Error('previsao nao cobre o horario atual')
  const n = forecast.width * forecast.height
  const u = new Array<number>(n)
  const v = new Array<number>(n)
  const precip = new Array<number>(n)
  for (let k = 0; k < n; k++) {
    const speed = forecast.speed[s][k]
    const dir = (forecast.direction[s][k] * Math.PI) / 180
    // Direcao meteorologica = de onde o vento VEM.
    u[k] = round2(-speed * Math.sin(dir))
    v[k] = round2(-speed * Math.cos(dir))
    precip[k] = round2(forecast.precip[s][k])
  }
  return {
    version: 1,
    width: forecast.width,
    height: forecast.height,
    bounds: { ...forecast.bounds },
    observed_at: new Date(forecast.times[s]).toISOString(),
    fetched_at: forecast.fetched_at,
    u,
    v,
    precip,
  }
}
