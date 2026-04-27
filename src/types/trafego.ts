// src/types/trafego.ts
// Tipos para trafego aereo (OpenSky) e maritimo (AISStream).

export interface AviationTraffic {
  id: string
  icao24: string
  callsign: string | null
  origin_country: string | null
  latitude: number
  longitude: number
  baro_altitude_m: number | null
  geo_altitude_m: number | null
  velocity_ms: number | null
  true_track: number | null
  vertical_rate_ms: number | null
  on_ground: boolean
  squawk: string | null
  category: number | null
  source: string
  observed_at: string
}

export interface MaritimeTraffic {
  id: string
  mmsi: number
  imo: number | null
  vessel_name: string | null
  callsign: string | null
  ship_type: number | null
  ship_type_label: string | null
  latitude: number
  longitude: number
  sog_knots: number | null
  cog_deg: number | null
  heading_deg: number | null
  nav_status: number | null
  nav_status_label: string | null
  destination: string | null
  eta: string | null
  draught_m: number | null
  length_m: number | null
  width_m: number | null
  source: string
  observed_at: string
}

// Categoria visual para colorir aeronaves no mapa
export type AviationCategory = 'on_ground' | 'low' | 'medium' | 'high' | 'cruise'

export function aviationCategory(altitude_m: number | null, on_ground: boolean): AviationCategory {
  if (on_ground) return 'on_ground'
  if (altitude_m === null) return 'medium'
  if (altitude_m < 1500) return 'low'
  if (altitude_m < 5000) return 'medium'
  if (altitude_m < 9000) return 'high'
  return 'cruise'
}

export const AVIATION_COLORS: Record<AviationCategory, string> = {
  on_ground: '#6b7280',
  low: '#fbbf24',
  medium: '#34d399',
  high: '#60a5fa',
  cruise: '#a78bfa',
}

// Mapeia ship_type AIS para grupo visual (cor + label compacto)
export type VesselGroup = 'cargo' | 'tanker' | 'passenger' | 'fishing' | 'tug' | 'pleasure' | 'other'

export function vesselGroup(ship_type: number | null): VesselGroup {
  if (ship_type === null) return 'other'
  if (ship_type >= 70 && ship_type <= 79) return 'cargo'
  if (ship_type >= 80 && ship_type <= 89) return 'tanker'
  if (ship_type >= 60 && ship_type <= 69) return 'passenger'
  if (ship_type === 30) return 'fishing'
  if (ship_type === 52) return 'tug'
  if (ship_type === 36 || ship_type === 37) return 'pleasure'
  return 'other'
}

export const VESSEL_COLORS: Record<VesselGroup, string> = {
  cargo: '#10b981',
  tanker: '#f97316',
  passenger: '#60a5fa',
  fishing: '#fbbf24',
  tug: '#a78bfa',
  pleasure: '#ec4899',
  other: '#94a3b8',
}

export const VESSEL_LABELS: Record<VesselGroup, string> = {
  cargo: 'Carga',
  tanker: 'Petroleiro',
  passenger: 'Passageiros',
  fishing: 'Pesca',
  tug: 'Rebocador',
  pleasure: 'Recreio',
  other: 'Outro',
}

// Conversoes
export const MS_TO_KMH = 3.6
export const M_TO_FT = 3.28084

export function speedKmh(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  return `${(ms * MS_TO_KMH).toFixed(0)} km/h`
}

export function altitudeFt(m: number | null): string {
  if (m === null || m === undefined) return '—'
  return `${(m * M_TO_FT).toFixed(0)} ft`
}

export function altitudeFL(m: number | null): string | null {
  if (m === null || m === undefined) return null
  const fl = (m * M_TO_FT) / 100
  if (fl < 5) return null
  return `FL${fl.toFixed(0).padStart(3, '0')}`
}

// ---- Interpolacao client-side: avioes "voam" entre snapshots do cron ----

const METERS_PER_DEG_LAT = 111320
// Cap maximo de extrapolacao em segundos. Alem disso, posicao trava na
// ultima conhecida — evita avioes flutuando 50km off quando data e stale.
const INTERP_CAP_SECONDS = 600

/**
 * Estima posicao atual de uma aeronave dada a ultima leitura conhecida,
 * velocidade e heading. Usa formulacao plana (small-angle approx) — ok
 * para janelas de ate ~10min em qualquer latitude.
 */
export function interpolatePosition(
  baseLat: number,
  baseLon: number,
  velocityMs: number | null,
  trueTrack: number | null,
  observedAt: string,
  now: number,
): [number, number] {
  if (velocityMs === null || velocityMs === undefined) return [baseLat, baseLon]
  if (trueTrack === null || trueTrack === undefined) return [baseLat, baseLon]

  const elapsedS = (now - new Date(observedAt).getTime()) / 1000
  if (elapsedS <= 0) return [baseLat, baseLon]
  const tCapped = Math.min(elapsedS, INTERP_CAP_SECONDS)

  const bearingRad = (trueTrack * Math.PI) / 180
  const distM = velocityMs * tCapped
  const northM = distM * Math.cos(bearingRad)
  const eastM = distM * Math.sin(bearingRad)

  const dLat = northM / METERS_PER_DEG_LAT
  const dLon = eastM / (METERS_PER_DEG_LAT * Math.cos((baseLat * Math.PI) / 180))

  return [baseLat + dLat, baseLon + dLon]
}
