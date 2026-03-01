// src/components/map/layers/DengueLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { GeoJSON } from 'react-leaflet'
import { supabase } from '@/lib/supabase'
import { useMapData } from '@/contexts/MapDataContext'
import type { Feature } from 'geojson'

interface DengueData {
  ibge_code: string
  cases: number | null
  alert_level: number | null
}

export function DengueLayer() {
  const { municipiosGeoJSON } = useMapData()

  const { data: dengueMap } = useQuery({
    queryKey: ['dengue-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('ibge_code, cases, alert_level')
        .order('epidemiological_week', { ascending: false })
        .limit(399)  // um por município

      const typedData = (data || []) as DengueData[]
      return Object.fromEntries(typedData.map(d => [d.ibge_code, d]))
    },
    staleTime: 1000 * 60 * 60, // 1h
  })

  if (!dengueMap || !municipiosGeoJSON) return null

  const DENGUE_COLORS = ['#065f46', '#92400e', '#c2410c', '#7f1d1d']

  return (
    <GeoJSON
      key="dengue-layer"
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const ibge = feature?.properties?.CD_MUN || feature?.properties?.geocodigo
        const dengue = dengueMap[ibge]
        const level = dengue?.alert_level || 0
        return {
          fillColor: DENGUE_COLORS[level],
          fillOpacity: 0.5,
          color: 'transparent',
          weight: 0,
        }
      }}
    />
  )
}
