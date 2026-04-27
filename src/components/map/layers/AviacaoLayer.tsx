// src/components/map/layers/AviacaoLayer.tsx
import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useAviationTraffic } from '@/hooks/useTrafego'
import {
  AVIATION_COLORS,
  aviationCategory,
  speedKmh,
  altitudeFt,
  altitudeFL,
} from '@/types/trafego'

interface AviacaoLayerProps {
  timeFilter?: string
}

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

export function AviacaoLayer({ timeFilter }: AviacaoLayerProps) {
  const { data: aircraft } = useAviationTraffic()

  const filtered = useMemo(() => {
    if (!aircraft) return []
    if (!timeFilter) return aircraft
    const cutoff = new Date(timeFilter).getTime()
    return aircraft.filter((a) => new Date(a.observed_at).getTime() <= cutoff)
  }, [aircraft, timeFilter])

  return (
    <>
      {filtered.map((a) => {
        const cat = aviationCategory(a.baro_altitude_m, a.on_ground)
        const color = AVIATION_COLORS[cat]
        const rot = a.true_track ?? 0
        const icon = buildAircraftIcon(rot, color, a.on_ground)
        const fl = altitudeFL(a.baro_altitude_m ?? a.geo_altitude_m)

        return (
          <Marker key={`acft-${a.icao24}`} position={[a.latitude, a.longitude]} icon={icon}>
            <Tooltip direction="top" offset={[0, -8]} className="map-tooltip">
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {a.callsign || a.icao24.toUpperCase()}
                  {fl && (
                    <span
                      style={{ marginLeft: 6, fontFamily: 'monospace', color: '#9ca3af', fontWeight: 500 }}
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
