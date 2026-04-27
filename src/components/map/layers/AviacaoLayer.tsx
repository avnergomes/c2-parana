// src/components/map/layers/AviacaoLayer.tsx
import { useEffect, useMemo, useState } from 'react'
import { Marker, Polyline, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useAviationTraffic, useAviationHistory } from '@/hooks/useTrafego'
import {
  AVIATION_COLORS,
  aviationCategory,
  speedKmh,
  altitudeFt,
  altitudeFL,
  interpolatePosition,
} from '@/types/trafego'
import type { AviationTraffic } from '@/types/trafego'

interface AviacaoLayerProps {
  timeFilter?: string
}

// Tick rapido pra animacao client-side. A cada 1.5s recomputa posicao
// interpolada de cada aeronave a partir da ultima leitura + velocidade.
const ANIMATION_TICK_MS = 1500
// Janela de rastro: 2/3 dos pontos historicos (ate 1h) por aeronave.
const TRAIL_KEEP_FRACTION = 2 / 3

function buildAircraftIcon(rotation: number, color: string, onGround: boolean): L.DivIcon {
  const opacity = onGround ? 0.55 : 1
  const svg = `
    <svg viewBox="0 0 24 24" width="22" height="22" style="transform: rotate(${rotation}deg); opacity: ${opacity}; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));">
      <path d="M12 2 L14 10 L22 12 L14 14 L13 22 L11 22 L10 14 L2 12 L10 10 Z"
            fill="${color}" stroke="#0f1117" stroke-width="0.6" stroke-linejoin="round"/>
    </svg>
  `
  return L.divIcon({
    html: svg,
    className: 'aviation-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

/** Tick state que avanca a cada N ms para forcar re-render dos markers. */
function useTickingTime(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function AviacaoLayer({ timeFilter }: AviacaoLayerProps) {
  const { data: aircraft } = useAviationTraffic()
  const { data: history } = useAviationHistory(1)
  const now = useTickingTime(ANIMATION_TICK_MS)

  // Snapshot filtrado pela timeline (se ativa)
  const filtered = useMemo<AviationTraffic[]>(() => {
    if (!aircraft) return []
    if (!timeFilter) return aircraft
    const cutoff = new Date(timeFilter).getTime()
    return aircraft.filter((a) => new Date(a.observed_at).getTime() <= cutoff)
  }, [aircraft, timeFilter])

  // Trails: para cada icao24 ativo, lat/lon dos ultimos 2/3 dos pontos
  // historicos ordenados por tempo. Polyline conecta esses pontos.
  const trails = useMemo<Map<string, [number, number][]>>(() => {
    const out = new Map<string, [number, number][]>()
    if (!history || !filtered.length) return out
    const activeIcaos = new Set(filtered.map((a) => a.icao24))
    const grouped = new Map<string, AviationTraffic[]>()
    for (const p of history) {
      if (!activeIcaos.has(p.icao24)) continue
      const arr = grouped.get(p.icao24)
      if (arr) arr.push(p)
      else grouped.set(p.icao24, [p])
    }
    for (const [icao24, pts] of grouped) {
      pts.sort(
        (a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime(),
      )
      // Mantem 2/3 finais (rastro recente)
      const start = Math.floor(pts.length * (1 - TRAIL_KEEP_FRACTION))
      const slice = pts.slice(start)
      if (slice.length >= 2) {
        out.set(
          icao24,
          slice.map((p) => [p.latitude, p.longitude]),
        )
      }
    }
    return out
  }, [history, filtered])

  return (
    <>
      {/* Rastros (Polyline) por aeronave — desenhados antes pra ficar atras */}
      {filtered.map((a) => {
        const trail = trails.get(a.icao24)
        if (!trail || trail.length < 2) return null
        const cat = aviationCategory(a.baro_altitude_m, a.on_ground)
        const color = AVIATION_COLORS[cat]
        // Inclui posicao atual interpolada como ponto final do rastro
        const headLat = a.latitude
        const headLon = a.longitude
        const last = trail[trail.length - 1]
        const positions: [number, number][] =
          last[0] === headLat && last[1] === headLon
            ? trail
            : [...trail, [headLat, headLon]]
        return (
          <Polyline
            key={`trail-${a.icao24}`}
            positions={positions}
            pathOptions={{
              color,
              weight: 2,
              opacity: 0.65,
              dashArray: '6 4',
            }}
          />
        )
      })}

      {/* Markers com posicao interpolada */}
      {filtered.map((a) => {
        const [lat, lon] = interpolatePosition(
          a.latitude,
          a.longitude,
          a.velocity_ms,
          a.true_track,
          a.observed_at,
          now,
        )
        const cat = aviationCategory(a.baro_altitude_m, a.on_ground)
        const color = AVIATION_COLORS[cat]
        const rot = a.true_track ?? 0
        const icon = buildAircraftIcon(rot, color, a.on_ground)
        const fl = altitudeFL(a.baro_altitude_m ?? a.geo_altitude_m)

        return (
          <Marker key={`acft-${a.icao24}`} position={[lat, lon]} icon={icon}>
            <Tooltip direction="top" offset={[0, -8]} className="map-tooltip">
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {a.callsign || a.icao24.toUpperCase()}
                  {fl && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontFamily: 'monospace',
                        color: '#9ca3af',
                        fontWeight: 500,
                      }}
                    >
                      {fl}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '2px 10px',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: '#9ca3af' }}>ICAO24</span>
                  <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                    {a.icao24.toUpperCase()}
                  </span>
                  {a.origin_country && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Origem</span>
                      <span style={{ color: '#e5e7eb' }}>{a.origin_country}</span>
                    </>
                  )}
                  <span style={{ color: '#9ca3af' }}>Velocidade</span>
                  <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                    {speedKmh(a.velocity_ms)}
                  </span>
                  <span style={{ color: '#9ca3af' }}>Altitude</span>
                  <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                    {altitudeFt(a.baro_altitude_m ?? a.geo_altitude_m)}
                  </span>
                  {a.true_track !== null && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Heading</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                        {a.true_track.toFixed(0)}°
                      </span>
                    </>
                  )}
                  {a.on_ground && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Status</span>
                      <span style={{ color: '#fbbf24' }}>Em solo</span>
                    </>
                  )}
                </div>
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
