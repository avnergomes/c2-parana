// npx deno test supabase/functions/etl-irtc/calc.test.ts
import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1'
import {
  W_AMBIENTE,
  W_AR,
  W_CLIMA,
  W_HIDRO,
  W_SAUDE,
  calcRAmbiente,
  calcRSaude,
  classifyRiskLevel,
  combinarDominios,
  inicioSemanaEpi,
  leituraFresca,
  semanaEpiFresca,
  type DominioAvaliado,
} from './calc.ts'
import { leituraRioValida } from '../_shared/frescor.ts'

const dom = (nome: DominioAvaliado['nome'], score: number, temDado: boolean): DominioAvaliado => ({
  nome,
  score,
  temDado,
  peso: { clima: W_CLIMA, saude: W_SAUDE, ambiente: W_AMBIENTE, hidro: W_HIDRO, ar: W_AR }[nome],
})

Deno.test('classe pelo corte >= limite (igual aos paineis)', () => {
  assertEquals(classifyRiskLevel(0), 'baixo')
  assertEquals(classifyRiskLevel(24.99), 'baixo')
  assertEquals(classifyRiskLevel(25), 'médio')
  assertEquals(classifyRiskLevel(49.99), 'médio')
  assertEquals(classifyRiskLevel(50), 'alto')
  assertEquals(classifyRiskLevel(74.99), 'alto')
  assertEquals(classifyRiskLevel(75), 'crítico')
  assertEquals(classifyRiskLevel(100), 'crítico')
})

Deno.test('formula v1 preservada: media so dos dominios com dado', () => {
  // dengue nivel 2 (50) e zero focos, sem clima/hidro/ar
  const r = combinarDominios([
    dom('clima', 0, false),
    dom('saude', calcRSaude(2)[0], true),
    dom('ambiente', calcRAmbiente(0)[0], true),
    dom('hidro', 0, false),
    dom('ar', 0, false),
  ])
  assertAlmostEquals(r.irtc, 27.78, 0.01)
  assertEquals(r.dataCoverage, 0.45)
  assertEquals(r.riskLevel, 'médio')
  assertEquals(r.dominantDomain, 'saude')
})

Deno.test('sem nenhum dominio: zero, cobertura zero, sem dominante', () => {
  const r = combinarDominios([dom('clima', 0, false), dom('saude', 0, false)])
  assertEquals(r.irtc, 0)
  assertEquals(r.dataCoverage, 0)
  assertEquals(r.dominantDomain, null)
})

Deno.test('falha na leitura de focos tira o ambiente da media', () => {
  assertEquals(calcRAmbiente(0, true), [0, true])
  assertEquals(calcRAmbiente(0, false), [0, false])
  assertEquals(calcRAmbiente(60, true), [100, true])
})

Deno.test('semana epidemiologica 1 contem o dia 4 de janeiro', () => {
  assertEquals(inicioSemanaEpi(2026, 1).toISOString().slice(0, 10), '2026-01-04')
  assertEquals(inicioSemanaEpi(2025, 1).toISOString().slice(0, 10), '2024-12-29')
  assertEquals(inicioSemanaEpi(2026, 43).toISOString().slice(0, 10), '2026-10-25')
})

Deno.test('dengue velha nao conta', () => {
  const agora = new Date('2026-10-28T12:00:00Z')
  assert(semanaEpiFresca(2026, 42, agora)) // terminou em 24/10
  assert(semanaEpiFresca(2026, 39, agora)) // terminou em 03/10 (25 dias)
  assert(!semanaEpiFresca(2026, 38, agora)) // terminou em 26/09 (32 dias)
  assert(!semanaEpiFresca(2025, 42, agora))
  assert(!semanaEpiFresca(Number.NaN, 42, agora))
})

Deno.test('leitura fresca respeita a janela', () => {
  const agora = new Date('2026-10-28T12:00:00Z')
  assert(leituraFresca('2026-10-28T01:00:00Z', agora, 12))
  assert(!leituraFresca('2026-10-27T23:00:00Z', agora, 12))
  assert(leituraFresca('2026-10-28T08:30:00-03:00', agora, 12))
  assert(!leituraFresca(null, agora, 12))
  assert(!leituraFresca('lixo', agora, 12))
})

Deno.test('arredondamento de meio vai para cima (o Python espelha o Math.round)', () => {
  const r = combinarDominios([{ peso: W_CLIMA, score: 40.625, temDado: true, nome: 'clima' }])
  assertEquals(r.irtc, 40.63) // round(40.625, 2) do Python dava 40.62
})

Deno.test('leitura de rio so vale com nivel e ate 12 h', () => {
  const agora = new Date('2026-10-28T12:00:00Z')
  assert(leituraRioValida({ level_cm: 310, observed_at: '2026-10-28T06:00:00-03:00' }, agora))
  assert(!leituraRioValida({ level_cm: null, observed_at: '2026-10-28T06:00:00-03:00' }, agora))
  assert(!leituraRioValida({ level_cm: 310, observed_at: '2026-10-27T20:00:00-03:00' }, agora))
})
