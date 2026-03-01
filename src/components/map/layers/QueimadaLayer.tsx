// src/components/map/layers/QueimadaLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { supabase } from '@/lib/supabase'

interface FireSpot {
  latitude: number
  longitude: number
  brightness: number | null
  acq_date: string | null
  municipality: string | null
}

export function QueimadaLayer() {
  const { data: fires } = useQuery({
    queryKey: ['fire-spots-map'],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('latitude, longitude, brightness, acq_date, municipality')
        .gte('acq_date', sevenDaysAgo)
        .limit(2000)
      return (data || []) as FireSpot[]
    },
    staleTime: 1000 * 60 * 30,
  })

  return (
    <>
      {fires?.map((fire, i) => (
        <CircleMarker
          key={`fire-${i}`}
          center={[fire.latitude, fire.longitude]}
          radius={4}
          pathOptions={{
            fillColor: '#ef4444',
            fillOpacity: 0.8,
            color: '#dc2626',
            weight: 1,
          }}
        >
          <Tooltip>
            <div className="text-xs">
              <p className="font-semibold">{fire.municipality || 'Foco de calor'}</p>
              <p>Brilho: {fire.brightness?.toFixed(0)}K</p>
              <p>{fire.acq_date}</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
