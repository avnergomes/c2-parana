// src/types/agro.ts

// Tipos para KPIs do data_cache
export interface VbpKpis {
  vbp_total_brl: number
  vbp_lavoura_brl: number
  vbp_pecuaria_brl: number
  variacao_yoy: number
  ano_referencia: string | number
}

export interface ComexKpis {
  exportacoes_usd: number
  importacoes_usd: number
  saldo_usd: number
  variacao_export_yoy: number
  mes_referencia: string
}

export interface EmpregoAgroKpis {
  estoque_atual: number
  saldo_mes: number
  variacao_yoy: number
  ano_referencia?: string | number
  serie?: Array<{
    ano?: string | number
    ano_mes?: string
    pessoal_ocupado?: number
    saldo?: number
  }>
}

export interface CreditoRuralKpis {
  total_ano_brl: number
  num_contratos: number
  variacao_yoy: number
  ano_referencia?: string | number
  serie?: Array<{
    ano_mes: string
    valor: number
  }>
}

// Tipos originais
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

/** Map: label curto → nome exato na API SIMA */
export const PRODUTOS_DESTAQUE_MAP: Record<string, string> = {
  'SOJA': 'Soja industrial tipo 1',
  'MILHO': 'Milho amarelo tipo 1',
  'TRIGO': 'Trigo pão',
  'FRANGO': 'Frango de corte',
  'SUÍNO': 'Suíno vivo',
  'CAFÉ': 'Café em coco',
  'BOI': 'Boi em pé',
}

export const PRODUTOS_DESTAQUE = Object.keys(PRODUTOS_DESTAQUE_MAP)
