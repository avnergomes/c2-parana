// src/types/saude.ts
export interface DengueData {
  id: string
  ibge_code: string
  municipality_name: string | null
  epidemiological_week: number
  year: number
  cases: number
  cases_est: number | null
  alert_level: 0 | 1 | 2 | 3
  incidence_rate: number | null
  population: number | null
  fetched_at: string
}

export interface SaudeKpis {
  total_casos_semana: number
  municipios_alerta: number
  municipios_epidemia: number
  semana_epidemiologica: number
  variacao_semana: number
  total_leitos_sus?: number
  cobertura_vacinal?: number
}

export const DENGUE_ALERT_CONFIG = {
  0: { color: '#10b981', label: 'Verde', description: 'Sem alerta', textColor: 'text-status-success' },
  1: { color: '#f59e0b', label: 'Amarelo', description: 'Alerta leve', textColor: 'text-status-warning' },
  2: { color: '#f97316', label: 'Laranja', description: 'Alerta moderado', textColor: 'text-orange-400' },
  3: { color: '#ef4444', label: 'Vermelho', description: 'Epidemia', textColor: 'text-status-danger' },
} as const

// Geocodes IBGE dos municípios PR: formato 410XXXX (começa com 41)
export function isPRMunicipality(ibge: string): boolean {
  return ibge.startsWith('41')
}
