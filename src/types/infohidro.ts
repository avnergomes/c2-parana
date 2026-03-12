// src/types/infohidro.ts

export interface ReservatorioData {
  nome: string
  volume_percent: number
  volume_hm3: number
  cota_m: number
  vazao_afluente: number | null
  vazao_defluente: number | null
  tendencia: 'subindo' | 'estavel' | 'descendo' | null
  chuva_mensal_mm: number | null
  chuva_30d_mm: number | null
  ultima_atualizacao: string
}

export interface EstacaoTelemetria {
  codigo: string
  nome: string
  tipo_id: number | null
  coleta_id: number | null
  orgao_id: number | null
  municipio_id: number | null
  latitude: number
  longitude: number
  inicio_operacao: string | null
}

export interface SensorTelemetria {
  codigo: number
  descricao: string
  unidade_padrao: string
}

export interface DisponibilidadeHidrica {
  locationid: string
  q1: number
  q30: number
  date: string
}

export interface PrevisaoMeteo {
  locationid: string
  date: string
  temp_max: number | null
  temp_min: number | null
  precip_probability: number | null
  precip_intensity: number | null
  wind_speed: number | null
  humidity_max: number | null
  humidity_min: number | null
}

// Colors for reservoir volume percentage
export const RESERVATORIO_COLORS = {
  critical: '#ef4444',  // < 30%
  low: '#f59e0b',       // 30-50%
  normal: '#3b82f6',    // 50-80%
  full: '#06b6d4',      // > 80%
} as const

export function volumeToColor(percent: number): string {
  if (percent < 30) return RESERVATORIO_COLORS.critical
  if (percent < 50) return RESERVATORIO_COLORS.low
  if (percent < 80) return RESERVATORIO_COLORS.normal
  return RESERVATORIO_COLORS.full
}

export function volumeToLabel(percent: number): string {
  if (percent < 30) return 'Crítico'
  if (percent < 50) return 'Baixo'
  if (percent < 80) return 'Normal'
  return 'Cheio'
}

// Known reservoir locations (approximate)
export const RESERVATORIOS_COORDS: Record<string, [number, number]> = {
  'Iraí': [-25.4089, -49.1375],
  'Passaúna': [-25.4577, -49.3862],
  'Piraquara I': [-25.4420, -49.0627],
  'Piraquara II': [-25.4690, -49.0450],
  'Miringuava': [-25.5310, -49.1350],
}
