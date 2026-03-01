// src/types/agro.ts
export interface PrecoSIMA {
  produto: string
  variedade: string
  mercado: string
  preco_min: number
  preco_max: number
  preco_medio: number
  unidade: string
  data: string
  variacao_dia?: number
  variacao_semana?: number
}

export interface VbpMunicipio {
  ibge_code: string
  municipio: string
  vbp_total: number
  vbp_lavoura?: number
  vbp_pecuaria?: number
  ano: number
}

export interface ComexItem {
  year: number
  month?: number
  sh4_code?: string
  product_name: string
  kg: number
  usd: number
  type: 'export' | 'import'
  country?: string
}

export interface EmpregoAgro {
  year: number
  month: number
  admissoes: number
  desligamentos: number
  saldo: number
  estoque: number
}

export interface CreditoRural {
  ano_mes: string
  valor_total: number
  num_contratos: number
  produto?: string
  finalidade?: string
}

export const PRODUTOS_DESTAQUE = [
  'SOJA', 'MILHO', 'TRIGO', 'CANA-DE-AÇÚCAR', 'FRANGO', 'SUÍNO', 'CAFÉ'
]
