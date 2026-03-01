// src/types/clima.ts
export interface EstacaoClima {
  station_code: string
  station_name: string
  municipality: string | null
  ibge_code: string | null
  latitude: number | null
  longitude: number | null
  temperature: number | null
  humidity: number | null
  pressure: number | null
  wind_speed: number | null
  wind_direction: number | null
  precipitation: number | null
  observed_at: string
}

export interface AlertaINMET {
  id: string
  source: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string | null
  affected_area: GeoJSON.Geometry | null
  affected_municipalities: string[] | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  external_id: string | null
}

// Estações principais do PR para o widget e cards
export const ESTACOES_PRINCIPAIS: Record<string, string> = {
  'A807': 'Curitiba',
  'A834': 'Londrina',
  'A820': 'Maringá',
  'A843': 'Cascavel',
  'A847': 'Foz do Iguaçu',
  'A823': 'Ponta Grossa',
}

export function getWindDirection(degrees: number | null): string {
  if (degrees === null) return '—'
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(degrees / 45) % 8]
}

export function getWeatherCondition(_temp: number | null, humidity: number | null, precipitation: number | null): string {
  if (precipitation && precipitation > 2) return '🌧 Chuva'
  if (precipitation && precipitation > 0) return '🌦 Garoa'
  if (humidity && humidity > 85) return '☁️ Nublado'
  if (humidity && humidity > 60) return '⛅ Parcialmente nublado'
  return '☀️ Ensolarado'
}

export const SEVERITY_CONFIG = {
  critical: { color: '#7f1d1d', border: '#dc2626', label: 'Crítico', badgeClass: 'badge-danger' },
  high: { color: '#7c2d12', border: '#ea580c', label: 'Alto', badgeClass: 'badge-danger' },
  medium: { color: '#78350f', border: '#d97706', label: 'Moderado', badgeClass: 'badge-warning' },
  low: { color: '#052e16', border: '#16a34a', label: 'Baixo', badgeClass: 'badge-success' },
  info: { color: '#1e3a5f', border: '#3b82f6', label: 'Informativo', badgeClass: 'badge-info' },
}
