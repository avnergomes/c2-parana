// src/components/map/layers/ManancialAlertsLayer.tsx
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useMananciais } from '@/hooks/useInfoHidro'
import { disponibilidadeToColor, disponibilidadeToLabel } from '@/types/manancial'

// Approximate municipality center coordinates for Paraná (subset — will be populated by ETL)
// Mananciais without coords will be skipped on the map
// The ETL should eventually include lat/lng from the InfoHidro API

export function ManancialAlertsLayer() {
  const { data: mananciais } = useMananciais()

  if (!mananciais?.length) return null

  // Only show mananciais that are in alert state
  const alertas = mananciais.filter(m => m.alerta)

  if (alertas.length === 0) return null

  return (
    <>
      {alertas.map(m => {
        // Use lat/lng from ETL data if available (ETL adds optional coords)
        const raw = m as unknown as Record<string, unknown>
        const lat = raw.latitude as number | undefined
        const lng = raw.longitude as number | undefined
        if (lat == null || lng == null) return null

        const color = disponibilidadeToColor(m.disponibilidade)
        const isCritico = m.disponibilidade === 'critico'

        return (
          <CircleMarker
            key={m.locationid}
            center={[lat, lng]}
            radius={isCritico ? 10 : 7}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.85,
              color: isCritico ? '#fbbf24' : 'rgba(255,255,255,0.4)',
              weight: isCritico ? 3 : 1.5,
              dashArray: isCritico ? '4 4' : undefined,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} className="map-tooltip">
              <div style={{ minWidth: 180, padding: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {m.municipio}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>{m.rio} — {m.sistema}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10 }}>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Vazão</span>
                    <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                      {m.vazao_m3s != null ? `${m.vazao_m3s.toFixed(3)} m³/s` : '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Status</span>
                    <div style={{ fontFamily: 'monospace', color }}>
                      {disponibilidadeToLabel(m.disponibilidade)}
                    </div>
                  </div>
                  {m.q1 != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Q1</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{m.q1.toFixed(3)}</div>
                    </div>
                  )}
                  {m.chuva_mm != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Chuva</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{m.chuva_mm.toFixed(1)} mm</div>
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
