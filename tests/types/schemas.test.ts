// tests/types/schemas.test.ts
import { describe, it, expect } from 'vitest'
import {
  safeParseCache,
  vbpKpisSchema,
  comexKpisSchema,
  empregoAgroSchema,
  creditoRuralSchema,
  leitosSusSchema,
} from '@/types/schemas'

describe('safeParseCache', () => {
  it('returns null for null data', () => {
    expect(safeParseCache(vbpKpisSchema, null)).toBeNull()
  })

  it('returns null for undefined data', () => {
    expect(safeParseCache(vbpKpisSchema, undefined)).toBeNull()
  })

  it('returns fallback for null data when fallback provided', () => {
    const fallback = { vbp_total_brl: 0, vbp_lavoura_brl: 0, vbp_pecuaria_brl: 0, variacao_yoy: 0, ano_referencia: '2023' }
    expect(safeParseCache(vbpKpisSchema, null, fallback)).toEqual(fallback)
  })

  it('returns parsed data for valid input', () => {
    const valid = {
      vbp_total_brl: 152000000000,
      vbp_lavoura_brl: 98000000000,
      vbp_pecuaria_brl: 54000000000,
      variacao_yoy: 3.8,
      ano_referencia: '2023',
    }
    expect(safeParseCache(vbpKpisSchema, valid)).toEqual(valid)
  })

  it('returns null for invalid data', () => {
    const invalid = { vbp_total_brl: 'not a number' }
    expect(safeParseCache(vbpKpisSchema, invalid)).toBeNull()
  })
})

describe('vbpKpisSchema', () => {
  it('validates correct VBP data', () => {
    const result = vbpKpisSchema.safeParse({
      vbp_total_brl: 152000000000,
      vbp_lavoura_brl: 98000000000,
      vbp_pecuaria_brl: 54000000000,
      variacao_yoy: 3.8,
      ano_referencia: 2023,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing fields', () => {
    const result = vbpKpisSchema.safeParse({ vbp_total_brl: 100 })
    expect(result.success).toBe(false)
  })
})

describe('comexKpisSchema', () => {
  it('validates correct ComexStat data', () => {
    const result = comexKpisSchema.safeParse({
      exportacoes_usd: 22500000000,
      importacoes_usd: 14800000000,
      saldo_usd: 7700000000,
      variacao_export_yoy: 6.2,
      mes_referencia: '202312',
    })
    expect(result.success).toBe(true)
  })
})

describe('empregoAgroSchema', () => {
  it('validates with optional fields', () => {
    const result = empregoAgroSchema.safeParse({
      estoque_atual: 485000,
      saldo_mes: 2300,
      variacao_yoy: 2.1,
    })
    expect(result.success).toBe(true)
  })

  it('validates with serie', () => {
    const result = empregoAgroSchema.safeParse({
      estoque_atual: 485000,
      saldo_mes: 2300,
      variacao_yoy: 2.1,
      ano_referencia: '2023',
      serie: [{ ano: '2023', pessoal_ocupado: 485000 }],
    })
    expect(result.success).toBe(true)
  })
})

describe('creditoRuralSchema', () => {
  it('validates correct data', () => {
    const result = creditoRuralSchema.safeParse({
      total_ano_brl: 45000000000,
      num_contratos: 185000,
      variacao_yoy: 12.3,
    })
    expect(result.success).toBe(true)
  })
})

describe('leitosSusSchema', () => {
  it('validates correct data', () => {
    const result = leitosSusSchema.safeParse({
      total_leitos: 25000,
      leitos_uti: 3500,
      data_referencia: '2024-01',
    })
    expect(result.success).toBe(true)
  })

  it('validates with optional ocupacao_uti_pct', () => {
    const result = leitosSusSchema.safeParse({
      total_leitos: 25000,
      leitos_uti: 3500,
      ocupacao_uti_pct: 72.5,
      data_referencia: '2024-01',
    })
    expect(result.success).toBe(true)
  })
})
