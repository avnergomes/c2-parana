// src/components/map/layers/ReservatoriosLayer.tsx
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useReservatorios } from '@/hooks/useInfoHidro'
import { volumeToColor, volumeToLabel, RESERVATORIOS_COORDS } from '@/types/infohidro'

export function ReservatoriosLayer() {
  const { data: reservatorios } = useReservatorios()

  if (!reservatorios || reservatorios.length === 0) return null

  return (
    <>
      {reservatorios.map(res => {
        const coords = RESERVATORIOS_COORDS[res.nome]
        if (!coords) return null

        const color = volumeToColor(res.volume_percent)
        const isCritical = res.volume_percent < 30
        const radius = 12

        const tendenciaIcon = res.tendencia === 'subindo' ? '▲' : res.tendencia === 'descendo' ? '▼' : '—'
        const tendenciaColor = res.tendencia === 'subindo' ? '#10b981' : res.tendencia === 'descendo' ? '#ef4444' : '#9ca3af'

        return (
          <CircleMarker
            key={res.nome}
            center={coords}
            radius={radius}
            pane="markerPane"
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.9,
              color: isCritical ? '#fbbf24' : 'rgba(255,255,255,0.5)',
              weight: isCritical ? 3 : 2,
              dashArray: isCritical ? '4 4' : undefined,
            }}
          >
            <Tooltip direction="top" offset={[0, -14]} className="map-tooltip">
              <div style={{ minWidth: 200, padding: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {res.nome}
                </div>

                {/* Volume bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2, color: '#9ca3af' }}>
                    <span>Volume</span>
                    <span style={{ fontWeight: 700, color: '#f3f4f6', fontFamily: 'monospace' }}>
                      {res.volume_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#374151', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(res.volume_percent, 100)}%`, height: '100%', borderRadius: 3, background: color }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10 }}>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Cota</span>
                    <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{res.cota_m.toFixed(2)} m</div>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af' }}>Capacidade</span>
                    <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{res.volume_hm3.toFixed(2)} hm³</div>
                  </div>
                  {res.vazao_afluente != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Afluente</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{res.vazao_afluente.toFixed(2)} m³/s</div>
                    </div>
                  )}
                  {res.vazao_defluente != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Defluente</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{res.vazao_defluente.toFixed(2)} m³/s</div>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#9ca3af' }}>Tendência</span>
                    <div style={{ fontFamily: 'monospace', color: tendenciaColor }}>
                      {tendenciaIcon} {volumeToLabel(res.volume_percent)}
                    </div>
                  </div>
                  {res.chuva_mensal_mm != null && (
                    <div>
                      <span style={{ color: '#9ca3af' }}>Chuva mês</span>
                      <div style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{res.chuva_mensal_mm.toFixed(0)} mm</div>
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
