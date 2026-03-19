// src/components/map/layers/QueimadaLayer.tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { supabase } from '@/lib/supabase'

interface FireSpot {
  latitude: number
  longitude: number
  brightness: number | null
  acq_date: string | null
  municipality: string | null
  satellite: string | null
  confidence: string | null
}

interface QueimadaLayerProps {
  timeFilter?: string // ISO string — only show spots on or before this date
}

function brightnessToRadius(brightness: number | null): number {
  if (!brightness) return 4
  if (brightness > 400) return 7
  if (brightness > 350) return 6
  if (brightness > 300) return 5
  return 4
}

function brightnessToOpacity(brightness: number | null): number {
  if (!brightness) return 0.6
  if (brightness > 400) return 0.95
  if (brightness > 350) return 0.85
  return 0.7
}

export function QueimadaLayer({ timeFilter }: QueimadaLayerProps) {
  const { data: fires } = useQuery({
    queryKey: ['fire-spots-map'],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('latitude, longitude, brightness, acq_date, municipality, satellite, confidence')
        .gte('acq_date', sevenDaysAgo)
        .limit(2000)
      return (data || []) as FireSpot[]
    },
    staleTime: 1000 * 60 * 30,
  })

  // Filter by timeline position: only show spots acquired on or before the selected date
  const filtered = useMemo(() => {
    if (!fires) return []
    if (!timeFilter) return fires
    const cutoff = timeFilter.split('T')[0] // YYYY-MM-DD
    return fires.filter(f => !f.acq_date || f.acq_date <= cutoff)
  }, [fires, timeFilter])

  return (
    <>
      {filtered.map((fire) => {
        const radius = brightnessToRadius(fire.brightness)
        const opacity = brightnessToOpacity(fire.brightness)

        return (
          <CircleMarker
            key={`fire-${fire.latitude}-${fire.longitude}-${fire.acq_date}`}
            center={[fire.latitude, fire.longitude]}
            radius={radius}
            pane="markerPane"
            pathOptions={{
              fillColor: '#ef4444',
              fillOpacity: opacity,
              color: '#fbbf24',
              weight: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} className="map-tooltip">
              <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {fire.municipality || 'Foco de calor'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', fontSize: 10 }}>
                  {fire.brightness && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Brilho</span>
                      <span style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{fire.brightness.toFixed(0)} K</span>
                    </>
                  )}
                  <span style={{ color: '#9ca3af' }}>Data</span>
                  <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fire.acq_date || '—'}</span>
                  {fire.satellite && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Satélite</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fire.satellite}</span>
                    </>
                  )}
                  {fire.confidence && (
                    <>
                      <span style={{ color: '#9ca3af' }}>Confiança</span>
                      <span style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>{fire.confidence}</span>
                    </>
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
