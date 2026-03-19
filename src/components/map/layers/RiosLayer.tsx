// src/components/map/layers/RiosLayer.tsx
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useRiverLevels } from '@/hooks/useAmbiente'
import { RIVER_ALERT_CONFIG } from '@/types/ambiente'

export function RiosLayer() {
  const { data: rivers } = useRiverLevels()

  if (!rivers?.length) return null

  return (
    <>
      {rivers.map(r => {
        if (r.latitude == null || r.longitude == null) return null

        const alert = RIVER_ALERT_CONFIG[r.alert_level] || RIVER_ALERT_CONFIG.normal
        const isAlert = r.alert_level !== 'normal'

        return (
          <CircleMarker
            key={r.station_code}
            center={[r.latitude, r.longitude]}
            radius={isAlert ? 9 : 6}
            pane="markerPane"
            pathOptions={{
              fillColor: alert.color,
              fillOpacity: 0.85,
              color: isAlert ? '#fbbf24' : 'rgba(255,255,255,0.4)',
              weight: isAlert ? 2.5 : 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} className="map-tooltip">
              <div style={{ minWidth: 170, padding: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: alert.color, display: 'inline-block', flexShrink: 0 }} />
                  {r.station_name}
                </div>
                {r.river_name && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>{r.river_name} — {r.municipality}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10 }}>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Nível</span>
                    <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                      {r.level_cm != null ? `${r.level_cm.toFixed(0)} cm` : '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Status</span>
                    <div style={{ fontFamily: 'monospace', color: alert.color }}>
                      {alert.label}
                    </div>
                  </div>
                  {r.flow_m3s != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Vazão</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{r.flow_m3s.toFixed(1)} m³/s</div>
                    </div>
                  )}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
