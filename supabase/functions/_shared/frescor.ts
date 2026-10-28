// supabase/functions/_shared/frescor.ts
//
// Idade maxima de cada leitura para valer como estado atual. Uma leitura
// mais velha que isso nao conta: o IRTC tira o dominio da media e os
// consumidores de river_levels (alertas, correlacoes, relatorio) a ignoram.
// Espelho: scripts/frescor.py.

/** clima_data: o etl-clima roda a cada 15 min; 36 h so tiram estacao parada. */
export const CLIMA_MAX_IDADE_H = 36
/** river_levels: o etl-ambiente roda a cada 6 h; 12 h = dois ciclos. */
export const RIO_MAX_IDADE_H = 12
/** air_quality: mesmo ciclo do etl-ambiente; estacao WAQI parada ha dias sai. */
export const AR_MAX_IDADE_H = 36
/** dengue_data: a semana epidemiologica terminou ha no maximo 4 semanas. */
export const DENGUE_MAX_IDADE_DIAS = 28

/** Leitura com timestamp de ate `maxHoras` horas atras. */
export function leituraFresca(observedAt: string | null | undefined, agora: Date, maxHoras: number): boolean {
  if (!observedAt) return false
  const t = Date.parse(observedAt)
  if (!Number.isFinite(t)) return false
  return agora.getTime() - t <= maxHoras * 3_600_000
}

/** Leitura de rio que vale como estado atual: nivel medido e ate 12 h. */
export function leituraRioValida(
  r: { level_cm?: number | null; observed_at?: string | null },
  agora: Date,
): boolean {
  return r.level_cm !== null && r.level_cm !== undefined && leituraFresca(r.observed_at, agora, RIO_MAX_IDADE_H)
}
