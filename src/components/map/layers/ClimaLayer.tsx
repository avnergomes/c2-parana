// src/components/map/layers/ClimaLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { Marker, Tooltip } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { supabase } from '@/lib/supabase'

interface StationData {
  station_code: string
  station_name: string | null
  latitude: number | null
  longitude: number | null
  temperature: number | null
  humidity: number | null
  observed_at: string | null
}

function tempToColor(temp: number): string {
  if (temp < 10) return '#60a5fa'
  if (temp < 18) return '#34d399'
  if (temp < 25) return '#fbbf24'
  if (temp < 32) return '#f97316'
  return '#ef4444'
}

export function ClimaLayer() {
  const { data: stations } = useQuery({
    queryKey: ['climate-map-markers'],
    queryFn: async () => {
      // Pegar leitura mais recente de cada estação
      const { data } = await supabase
        .from('climate_data')
        .select('station_code, station_name, latitude, longitude, temperature, humidity, observed_at')
        .not('latitude', 'is', null)
        .order('observed_at', { ascending: false })
        .limit(60)

      const typedData = (data || []) as StationData[]

      // Deduplicate por station_code
      const seen = new Set<string>()
      return typedData.filter(s => {
        if (seen.has(s.station_code)) return false
        seen.add(s.station_code)
        return true
      })
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
  })

  return (
    <>
      {stations?.map(station => {
        if (!station.latitude || !station.longitude) return null
        const color = tempToColor(station.temperature || 20)
        const icon = divIcon({
          className: '',
          html: `<div style="
            background: ${color};
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 4px;
            padding: 2px 5px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 600;
            color: white;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          ">${station.temperature?.toFixed(1)}°</div>`,
          iconAnchor: [20, 10],
        })

        return (
          <Marker
            key={station.station_code}
            position={[station.latitude, station.longitude]}
            icon={icon}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              <div className="text-xs space-y-0.5 min-w-[140px]">
                <p className="font-semibold">{station.station_name}</p>
                <p>Temp: <span className="font-mono">{station.temperature?.toFixed(1)}°C</span></p>
                <p>Umidade: <span className="font-mono">{station.humidity?.toFixed(0)}%</span></p>
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
