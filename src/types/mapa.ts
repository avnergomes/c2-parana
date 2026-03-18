// src/types/mapa.ts
export type LayerId = 'clima' | 'queimadas' | 'rios' | 'dengue' | 'vbp' | 'credito' | 'reservatorios' | 'alertas_hidricos'

export interface LayerConfig {
  id: LayerId
  label: string
  color: string
  plan: 'solo' | 'pro'
  description: string
}

export const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'clima', label: 'Clima', color: '#3b82f6', plan: 'solo', description: 'Estações meteorológicas' },
  { id: 'queimadas', label: 'Queimadas', color: '#ef4444', plan: 'pro', description: 'Focos de calor (FIRMS)' },
  { id: 'rios', label: 'Rios', color: '#06b6d4', plan: 'pro', description: 'Nível de rios (ANA)' },
  { id: 'dengue', label: 'Dengue', color: '#f59e0b', plan: 'pro', description: 'Alertas InfoDengue' },
  { id: 'vbp', label: 'VBP Agro', color: '#10b981', plan: 'pro', description: 'Valor Bruto da Produção' },
  { id: 'credito', label: 'Crédito Rural', color: '#8b5cf6', plan: 'pro', description: 'Crédito rural BCB' },
  { id: 'reservatorios', label: 'Reservatórios', color: '#06b6d4', plan: 'pro', description: 'Reservatórios SAIC (InfoHidro)' },
  { id: 'alertas_hidricos', label: 'Alertas Hídricos', color: '#ef4444', plan: 'pro', description: 'Mananciais em alerta (291 pontos)' },
]

export interface MunicipalityData {
  ibge_code: string
  name: string
  clima?: {
    temperature?: number
    humidity?: number
    condition?: string
  }
  dengue?: {
    cases?: number
    alert_level?: number
  }
  fires?: number
  vbp?: number
  river_alert?: string
}
