// src/types/schemas.ts
/**
 * Schemas para validacao dos dados do data_cache.
 *
 * NOTA: Para usar validacao com Zod, instale o pacote:
 * npm install zod
 *
 * Depois descomente as definicoes de schema abaixo.
 */

// Re-exportar tipos do arquivo agro.ts
export type {
  VbpKpis,
  ComexKpis,
  EmpregoAgroKpis as EmpregoAgro,
  CreditoRuralKpis as CreditoRural,
  VbpMunicipio,
} from './agro'

// Leitos SUS
export interface LeitosSus {
  total_leitos: number
  leitos_uti: number
  ocupacao_uti_pct?: number
  data_referencia: string
}

/**
 * Helper para validar dados do cache com fallback seguro.
 * Versao simplificada sem Zod - apenas faz type assertion.
 *
 * Para validacao completa com Zod:
 * 1. npm install zod
 * 2. Criar schemas Zod para cada tipo
 * 3. Usar schema.safeParse(data)
 */
export function safeParseCache<T>(
  _schema: unknown,
  data: unknown,
  fallback: T | null = null
): T | null {
  if (data === null || data === undefined) {
    return fallback
  }
  return data as T
}
