// supabase/functions/etl-irtc/calc.ts
// Regras puras do IRTC v1, separadas do index.ts (que sobe o Deno.serve) para
// serem testaveis: npx deno test supabase/functions/etl-irtc/calc.test.ts
// Espelho 1:1 das funcoes calc_* de scripts/etl_irtc.py.

export const W_CLIMA = 0.25
export const W_SAUDE = 0.25
export const W_AMBIENTE = 0.20
export const W_HIDRO = 0.15
export const W_AR = 0.15

/** Versao do metodo gravada em irtc_scores.versao_metodo. */
export const VERSAO_METODO = 'v1.1'

/** Leitura mais velha que isso nao conta como dado do dominio. */
export const CLIMA_MAX_IDADE_H = 36
export const RIO_MAX_IDADE_H = 12
export const DENGUE_MAX_IDADE_DIAS = 28

export type Avaliacao = [score: number, temDado: boolean]

export function calcRClima(
  temperature: number | null,
  humidity: number | null,
  precipitation72h: number,
): Avaliacao {
  const scores: number[] = []
  if (temperature !== null && temperature !== undefined) {
    scores.push(temperature > 40 ? 100 : temperature > 35 ? 50 : 0)
  }
  if (humidity !== null && humidity !== undefined) {
    scores.push(humidity < 30 ? 50 : 0)
  }
  if (precipitation72h !== null && precipitation72h > 0) {
    scores.push(
      precipitation72h > 100 ? 100 : precipitation72h > 50 ? 60 : precipitation72h > 20 ? 25 : 0,
    )
  }
  if (scores.length === 0) return [0, false]
  return [scores.reduce((a, b) => a + b, 0) / scores.length, true]
}

export function calcRSaude(alertLevel: number): Avaliacao {
  const mapping: Record<number, number> = { 1: 25, 2: 50, 3: 75, 4: 100 }
  const level = Math.trunc(alertLevel || 0)
  if (level in mapping) return [mapping[level], true]
  return [0, false]
}

/**
 * Focos FIRMS em 30 dias. Zero focos e leitura valida (o FIRMS cobre o PR
 * inteiro desde que o bbox foi corrigido); `temDado` vira false so quando a
 * leitura de fire_spots falhou nesta execucao.
 */
export function calcRAmbiente(fireCount: number, leituraOk = true): Avaliacao {
  if (!leituraOk) return [0, false]
  if (fireCount <= 0) return [0, true]
  if (fireCount <= 3) return [15, true]
  if (fireCount <= 15) return [40, true]
  if (fireCount <= 50) return [70, true]
  return [100, true]
}

export function calcRHidro(alertLevel: string, hasStation: boolean): Avaliacao {
  const mapping: Record<string, number> = { normal: 0, attention: 33, alert: 66, emergency: 100 }
  return [mapping[alertLevel || 'normal'] ?? 0, hasStation]
}

export function calcRAr(aqi: number | undefined | null): Avaliacao {
  if (aqi === undefined || aqi === null) return [0, false]
  if (aqi <= 50) return [0, true]
  if (aqi <= 100) return [25, true]
  if (aqi <= 150) return [50, true]
  if (aqi <= 200) return [75, true]
  return [100, true]
}

/**
 * Classe pelo corte ">= limite", a mesma convencao dos consumidores (console:
 * useIRTC >= 75 / >= 50, useTendencias < 25 / < 50 / < 75). Ate 2026-10 o
 * ETL usava "<= limite" e um 75,00 era "alto" na tabela e "critico" no painel.
 */
export function classifyRiskLevel(irtc: number): string {
  if (irtc < 25) return 'baixo'
  if (irtc < 50) return 'médio'
  if (irtc < 75) return 'alto'
  return 'crítico'
}

/** Inicio (domingo) da semana epidemiologica `semana` de `ano` (SINAN). */
export function inicioSemanaEpi(ano: number, semana: number): Date {
  // A semana 1 e a que contem o dia 4 de janeiro, contada de domingo a sabado.
  const jan4 = new Date(Date.UTC(ano, 0, 4))
  const domingoSemana1 = new Date(jan4.getTime() - jan4.getUTCDay() * 86_400_000)
  return new Date(domingoSemana1.getTime() + (semana - 1) * 7 * 86_400_000)
}

/** A semana epidemiologica terminou ha no maximo `maxDias` dias? */
export function semanaEpiFresca(ano: number, semana: number, agora: Date, maxDias = DENGUE_MAX_IDADE_DIAS): boolean {
  if (!Number.isFinite(ano) || !Number.isFinite(semana) || semana < 1) return false
  const fim = inicioSemanaEpi(ano, semana).getTime() + 7 * 86_400_000
  return agora.getTime() - fim <= maxDias * 86_400_000
}

/** Leitura com timestamp de ate `maxHoras` horas atras. */
export function leituraFresca(observedAt: string | null | undefined, agora: Date, maxHoras: number): boolean {
  if (!observedAt) return false
  const t = Date.parse(observedAt)
  if (!Number.isFinite(t)) return false
  return agora.getTime() - t <= maxHoras * 3_600_000
}

export interface DominioAvaliado {
  peso: number
  score: number
  temDado: boolean
  nome: 'clima' | 'saude' | 'ambiente' | 'hidro' | 'ar'
}

export interface ResultadoIrtc {
  irtc: number
  dataCoverage: number
  maxDomainScore: number
  dominantDomain: string | null
  riskLevel: string
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Media ponderada so dos dominios com dado ("Opcao 4"): dominio sem dado sai
 * da media em vez de entrar como zero. data_coverage = soma dos pesos usados.
 */
export function combinarDominios(dominios: DominioAvaliado[]): ResultadoIrtc {
  const disponiveis = dominios.filter((d) => d.temDado)
  let irtc = 0
  let dataCoverage = 0
  if (disponiveis.length > 0) {
    const pesoTotal = disponiveis.reduce((acc, d) => acc + d.peso, 0)
    irtc = round2(disponiveis.reduce((acc, d) => acc + d.peso * d.score, 0) / pesoTotal)
    dataCoverage = round2(pesoTotal)
  }
  let maxDomainScore = 0
  let dominantDomain: string | null = null
  for (const d of dominios) {
    if (d.temDado && d.score > maxDomainScore) {
      maxDomainScore = d.score
      dominantDomain = d.nome
    }
  }
  if (dominantDomain === null && disponiveis.length > 0) dominantDomain = disponiveis[0].nome
  return { irtc, dataCoverage, maxDomainScore, dominantDomain, riskLevel: classifyRiskLevel(irtc) }
}
