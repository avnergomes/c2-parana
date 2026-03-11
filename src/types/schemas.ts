// src/types/schemas.ts
import { z } from 'zod'

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

// Zod schemas for data_cache validation
export const vbpKpisSchema = z.object({
  vbp_total_brl: z.number(),
  vbp_lavoura_brl: z.number(),
  vbp_pecuaria_brl: z.number(),
  variacao_yoy: z.number(),
  ano_referencia: z.union([z.string(), z.number()]),
})

export const comexKpisSchema = z.object({
  exportacoes_usd: z.number(),
  importacoes_usd: z.number(),
  saldo_usd: z.number(),
  variacao_export_yoy: z.number(),
  mes_referencia: z.string(),
})

export const empregoAgroSchema = z.object({
  estoque_atual: z.number(),
  saldo_mes: z.number(),
  variacao_yoy: z.number(),
  ano_referencia: z.union([z.string(), z.number()]).optional(),
  serie: z.array(z.object({
    ano: z.union([z.string(), z.number()]).optional(),
    ano_mes: z.string().optional(),
    pessoal_ocupado: z.number().optional(),
    saldo: z.number().optional(),
  })).optional(),
})

export const creditoRuralSchema = z.object({
  total_ano_brl: z.number(),
  num_contratos: z.number(),
  variacao_yoy: z.number(),
  ano_referencia: z.union([z.string(), z.number()]).optional(),
})

export const leitosSusSchema = z.object({
  total_leitos: z.number(),
  leitos_uti: z.number(),
  ocupacao_uti_pct: z.number().optional(),
  data_referencia: z.string(),
})

/**
 * Validates data from data_cache using Zod schemas.
 * Returns fallback on invalid data instead of crashing.
 */
export function safeParseCache<T>(
  schema: z.ZodType<T>,
  data: unknown,
  fallback: T | null = null
): T | null {
  if (data === null || data === undefined) {
    return fallback
  }
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }
  if (import.meta.env.DEV) {
    console.warn('[safeParseCache] Validation failed:', result.error.flatten())
  }
  return fallback
}
