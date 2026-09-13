// Testes da logica pura: npx deno test supabase/functions/etl-meteo-grade/grid.test.ts
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  assembleForecast,
  buildChunkUrl,
  buildGridPoints,
  CHUNK_SIZE,
  currentSlotIndex,
  FORECAST_SLOTS,
  GRID_HEIGHT,
  GRID_WIDTH,
  needsApiRefresh,
  PAST_SLOTS,
  parseGmtTime,
  selectCurrentGrid,
  SLOT_MS,
} from './grid.ts'

const N = GRID_WIDTH * GRID_HEIGHT
const T0 = '2026-09-13T13:15'
const T0_MS = Date.parse('2026-09-13T13:15:00Z')

function fakePoint(slots = PAST_SLOTS + FORECAST_SLOTS, { speed = 5, dir = 180, mm = 0 } = {}) {
  const time = Array.from({ length: slots }, (_, s) => new Date(T0_MS + s * SLOT_MS).toISOString().slice(0, 16))
  return {
    minutely_15: {
      time,
      wind_speed_10m: time.map(() => speed),
      wind_direction_10m: time.map(() => dir),
      precipitation: time.map((_, s) => (s === 2 ? mm : 0)),
    },
  }
}

function fakeChunks(overrides: Record<number, unknown> = {}) {
  const pts = Array.from({ length: N }, (_, k) => overrides[k] ?? fakePoint())
  const chunks: unknown[][] = []
  for (let i = 0; i < N; i += CHUNK_SIZE) chunks.push(pts.slice(i, i + CHUNK_SIZE))
  return chunks
}

Deno.test('grade 22x15, linha 0 no sul, 3 lotes de 110 pontos', () => {
  const pts = buildGridPoints()
  assertEquals(pts.length, 330)
  assertEquals(pts[0], { lat: -27, lon: -55 })
  assertEquals(pts[N - 1], { lat: -22.3, lon: -48 })
  const url = new URL(buildChunkUrl(pts.slice(0, CHUNK_SIZE)))
  assertEquals(url.searchParams.get('latitude')!.split(',').length, 110)
  assertEquals(url.searchParams.get('minutely_15'), 'wind_speed_10m,wind_direction_10m,precipitation')
  assertEquals(url.searchParams.get('timezone'), 'GMT')
  assertEquals(url.searchParams.get('wind_speed_unit'), 'ms')
})

Deno.test('parseGmtTime trata horario sem fuso como UTC', () => {
  assertEquals(parseGmtTime(T0), T0_MS)
  assertEquals(parseGmtTime('2026-09-13T13:15Z'), T0_MS)
})

Deno.test('assembleForecast junta lotes e rejeita grade incompleta ou desalinhada', () => {
  const f = assembleForecast(fakeChunks({ 5: fakePoint(undefined, { mm: 1.5 }) }), new Date(T0_MS))
  assertEquals(f.times.length, PAST_SLOTS + FORECAST_SLOTS)
  assertEquals(f.speed[0].length, N)
  assertEquals(f.precip[2][5], 1.5)
  assertThrows(() => assembleForecast([fakeChunks().flat().slice(1)], new Date()), Error, 'incompleta')
  const shifted = fakePoint()
  shifted.minutely_15.time = shifted.minutely_15.time.map((t) => t.replace('13:15', '13:30'))
  assertThrows(() => assembleForecast(fakeChunks({ 7: shifted }), new Date()), Error, 'divergentes')
  assertThrows(() => assembleForecast(fakeChunks({ 0: { minutely_15: { time: [] } } }), new Date()), Error, 'sem slots')
})

Deno.test('currentSlotIndex escolhe o ultimo slot iniciado e expira o ultimo', () => {
  const f = { times: [T0_MS, T0_MS + SLOT_MS, T0_MS + 2 * SLOT_MS] }
  assertEquals(currentSlotIndex(f, T0_MS - 1), -1)
  assertEquals(currentSlotIndex(f, T0_MS), 0)
  assertEquals(currentSlotIndex(f, T0_MS + SLOT_MS + 60_000), 1)
  assertEquals(currentSlotIndex(f, T0_MS + 2 * SLOT_MS + 14 * 60_000), 2)
  assertEquals(currentSlotIndex(f, T0_MS + 3 * SLOT_MS), -1)
})

Deno.test('needsApiRefresh: reusa previsao nova, rebusca velha, sem cobertura ou grade diferente', () => {
  const fetchedAt = new Date(T0_MS + 30 * 60_000)
  const f = assembleForecast(fakeChunks(), fetchedAt)
  const now = T0_MS + 40 * 60_000
  assertEquals(needsApiRefresh(f, now), false)
  assertEquals(needsApiRefresh(null, now), true)
  assertEquals(needsApiRefresh(f, fetchedAt.getTime() + 111 * 60_000), true, 'mais de 110 min')
  assertEquals(needsApiRefresh({ ...f, width: 21 }, now), true)
  assertEquals(needsApiRefresh({ ...f, bounds: { ...f.bounds, west: -56 } }, now), true)
  assertEquals(needsApiRefresh(f, fetchedAt.getTime() - 60_000), true, 'relogio anterior ao fetch')
  const short = { ...f, times: f.times.slice(0, 4) }
  assertEquals(needsApiRefresh(short, now), true, 'nao cobre a proxima meia hora')
})

Deno.test('selectCurrentGrid converte direcao meteorologica em u/v e arredonda', () => {
  // Vento de SUL (180 graus) sopra para o norte: u ~ 0, v > 0.
  const f = assembleForecast(fakeChunks({ 0: fakePoint(undefined, { speed: 10, dir: 180, mm: 0.456 }) }), new Date(T0_MS))
  const grid = selectCurrentGrid(f, T0_MS + 2 * SLOT_MS + 60_000)
  assertEquals(grid.observed_at, new Date(T0_MS + 2 * SLOT_MS).toISOString())
  assertEquals(grid.u.length, N)
  assertEquals(grid.u[0], 0)
  assertEquals(grid.v[0], 10)
  assertEquals(grid.precip[0], 0.46)
  // Vento de LESTE (90 graus) sopra para oeste: u < 0.
  const east = assembleForecast(fakeChunks({ 0: fakePoint(undefined, { speed: 4, dir: 90 }) }), new Date(T0_MS))
  assert(selectCurrentGrid(east, T0_MS).u[0] === -4)
  assertThrows(() => selectCurrentGrid(f, T0_MS - 1), Error, 'nao cobre')
})
