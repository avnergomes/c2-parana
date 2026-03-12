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

// Index 0-3 = alert levels, index 4 = no data
const DENGUE_COLORS = ['#065f46', '#92400e', '#c2410c', '#7f1d1d']
const NO_DATA_COLOR = '#1f2937'

export function DengueLayer() {
  const { municipiosGeoJSON } = useMapData()

  const { data: dengueMap, isLoading } = useQuery({
    queryKey: ['dengue-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('ibge_code, cases, alert_level')
        .order('epidemiological_week', { ascending: false })
        .limit(399)

      const typedData = (data || []) as DengueData[]
      return Object.fromEntries(typedData.map(d => [d.ibge_code, d]))
    },
    staleTime: 1000 * 60 * 60,
  })

  if (isLoading || !municipiosGeoJSON) return null
  if (!dengueMap) return null

  return (
    <GeoJSON
      key="dengue-layer"
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const p = feature?.properties
        const ibge = String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
        const dengue = dengueMap[ibge]
        if (!dengue) {
          return { fillColor: NO_DATA_COLOR, fillOpacity: 0.2, color: 'transparent', weight: 0 }
        }
        const raw = dengue.alert_level
        const level = (typeof raw === 'number' && raw >= 0 && raw <= 3) ? raw : 0
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
