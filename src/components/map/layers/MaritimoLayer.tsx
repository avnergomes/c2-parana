// src/components/map/layers/MaritimoLayer.tsx
import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useMaritimeTraffic } from '@/hooks/useTrafego'
import { VESSEL_COLORS, VESSEL_LABELS, vesselGroup } from '@/types/trafego'

interface MaritimoLayerProps {
  timeFilter?: string
}

function buildVesselIcon(rotation: number, color: string, isMoored: boolean): L.DivIcon {
  const opacity = isMoored ? 0.6 : 1
  const svg = `
    <svg viewBox="0 0 24 24" width="20" height="20" style="transform: rotate(${rotation}deg); opacity: ${opacity}; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));">
      <path d="M12 2 L18 11 L18 20 L12 17 L6 20 L6 11 Z"
            fill="${color}" stroke="#0f1117" stroke-width="0.7" stroke-linejoin="round"/>
    </svg>
  `
  return L.divIcon({
    html: svg,
    className: 'maritime-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

export function MaritimoLayer({ timeFilter }: MaritimoLayerProps) {
  const { data: vessels } = useMaritimeTraffic()

  const filtered = useMemo(() => {
    if (!vessels) return []
    if (!timeFilter) return vessels
    const cutoff = new Date(timeFilter).getTime()
    return vessels.filter((v) => new Date(v.observed_at).getTime() <= cutoff)
  }, [vessels, timeFilter])

  return (
    <>
      {filtered.map((v) => {
        const group = vesselGroup(v.ship_type)
        const color = VESSEL_COLORS[group]
        const rot = v.heading_deg ?? v.cog_deg ?? 0
        const isMoored = v.nav_status === 1 || v.nav_status === 5 || v.nav_status === 6
        const icon = buildVesselIcon(rot, color, isMoored)

        return (
          <Marker key={`vessel-${v.mmsi}`} position={[v.latitude, v.longitude]} icon={icon}>
            <Tooltip direction="top" offset={[0, -8]} className="map-tooltip">
              <div style={{ minWidth: 170 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {v.vessel_name || `MMSI ${v.mmsi}`}
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: color + '33',
                      color: color,
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: 0.3,
                    }}
                  >
                    {VESSEL_LABELS[group].toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '2px 10px',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: '#9ca3af' }}>MMSI</span>
                  <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{v.mmsi}</span>
                  {v.imo && (
                    <>
                      <span style={{ color: '#9ca3af' }}>IMO</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{v.imo}</span>
                    </>
                  )}
                  {v.sog_knots !== null && (
                    <>
                      <span style={{ color: '#9ca3af' }}>SOG</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                        {v.sog_knots.toFixed(1)} kn
                      </span>
                    </>
                  )}
                  {v.cog_deg !== null && (
                    <>
                      <span style={{ color: '#9ca3af' }}>COG</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                        {v.cog_deg.toFixed(0)}°
                      </span>
                    </>
                  )}
                  {v.nav_status_label && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Status</span>
                      <span style={{ color: isMoored ? '#fbbf24' : '#34d399', fontSize: 9 }}>
                        {v.nav_status_label}
                      </span>
                    </>
                  )}
                  {v.destination && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Destino</span>
                      <span style={{ color: '#e5e7eb', fontSize: 9 }}>{v.destination}</span>
                    </>
                  )}
                  {v.length_m && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Compr.</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{v.length_m}m</span>
                    </>
                  )}
                  {v.draught_m && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Calado</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                        {v.draught_m.toFixed(1)}m
                      </span>
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
