// src/types/ambiente.ts
export interface FireSpot {
  id: string
  latitude: number
  longitude: number
  brightness: number | null
  acq_date: string
  satellite: string | null
  confidence: string | null
  municipality: string | null
  ibge_code: string | null
}

export interface RiverLevel {
  id: string
  station_code: string
  station_name: string
  river_name: string | null
  municipality: string | null
  latitude: number | null
  longitude: number | null
  level_cm: number | null
  flow_m3s: number | null
  alert_level: 'normal' | 'attention' | 'alert' | 'emergency'
  observed_at: string
}

export interface AirQualityData {
  id: string
  city: string
  station_name: string | null
  aqi: number | null
  dominant_pollutant: string | null
  pm25: number | null
  pm10: number | null
  observed_at: string
}

export const AQI_CONFIG = {
  good: { range: [0, 50], color: '#10b981', label: 'Boa', description: 'Qualidade do ar satisfatória' },
  moderate: { range: [51, 100], color: '#f59e0b', label: 'Moderada', description: 'Qualidade aceitável' },
  unhealthy_sensitive: { range: [101, 150], color: '#f97316', label: 'Ruim (sensíveis)', description: 'Grupos sensíveis podem ser afetados' },
  unhealthy: { range: [151, 200], color: '#ef4444', label: 'Ruim', description: 'Saúde de todos pode ser afetada' },
  very_unhealthy: { range: [201, 300], color: '#8b5cf6', label: 'Muito ruim', description: 'Alertas de saúde' },
  hazardous: { range: [301, 500], color: '#7f1d1d', label: 'Perigoso', description: 'Emergência de saúde' },
} as const

export function getAqiCategory(aqi: number): keyof typeof AQI_CONFIG {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'unhealthy_sensitive'
  if (aqi <= 200) return 'unhealthy'
  if (aqi <= 300) return 'very_unhealthy'
  return 'hazardous'
}

export const RIVER_ALERT_CONFIG = {
  normal: { color: '#10b981', label: 'Normal', icon: '💧' },
  attention: { color: '#f59e0b', label: 'Atenção', icon: '⚠️' },
  alert: { color: '#f97316', label: 'Alerta', icon: '🔶' },
  emergency: { color: '#ef4444', label: 'Emergência', icon: '🚨' },
}

export const CIDADES_AR = [
  { id: 'curitiba', label: 'Curitiba', waqi: 'curitiba' },
  { id: 'londrina', label: 'Londrina', waqi: 'londrina' },
  { id: 'maringa', label: 'Maringá', waqi: 'maringa' },
  { id: 'foz', label: 'Foz do Iguaçu', waqi: 'foz-do-iguacu' },
]
