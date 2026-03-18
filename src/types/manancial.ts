// src/types/manancial.ts

export interface Manancial {
  locationid: number
  sia_code: string
  municipio: string
  sistema: string
  rio: string
  vazao_m3s: number | null
  tendencia: 'subindo' | 'estavel' | 'descendo' | null
  disponibilidade: 'critico' | 'baixo' | 'normal' | 'alto' | null
  q1: number | null
  q30: number | null
  alerta: boolean
  chuva_mm: number | null
  prob_chuva: number | null
  temp_min: number | null
  temp_max: number | null
  umidade_min: number | null
  umidade_max: number | null
  ultima_atualizacao: string
}

export interface ManancialKpis {
  total_mananciais: number
  em_alerta: number
  disponibilidade_media: string
  municipios_monitorados: number
  data_referencia: string
}

export const DISPONIBILIDADE_COLORS: Record<string, string> = {
  critico: '#ef4444',
  baixo: '#f59e0b',
  normal: '#3b82f6',
  alto: '#06b6d4',
} as const

export function disponibilidadeToColor(disp: string | null): string {
  return DISPONIBILIDADE_COLORS[disp ?? ''] ?? '#6b7280'
}

export function disponibilidadeToLabel(disp: string | null): string {
  switch (disp) {
    case 'critico': return 'Crítico'
    case 'baixo': return 'Baixo'
    case 'normal': return 'Normal'
    case 'alto': return 'Alto'
    default: return 'N/D'
  }
}
