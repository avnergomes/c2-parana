// src/components/map/layers/CreditoRuralLayer.tsx
import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMapData } from '@/contexts/MapDataContext'
import type { Feature } from 'geojson'

interface CreditoMunicipio {
  ibge_code: string
  municipio: string
  valor_total: number
  num_contratos: number
}

// Escala de roxos: mais escuro = mais crédito
const CREDITO_SCALE = [
  { min: 0, color: '#4c1d95' },       // < 10M
  { min: 10, color: '#5b21b6' },      // 10-50M
  { min: 50, color: '#6d28d9' },      // 50-100M
  { min: 100, color: '#7c3aed' },     // 100-300M
  { min: 300, color: '#8b5cf6' },     // 300M-1B
  { min: 1000, color: '#a78bfa' },    // 1B+
]
const NO_DATA_COLOR = '#1f2937'

function creditoToColor(valorMillions: number): string {
  for (let i = CREDITO_SCALE.length - 1; i >= 0; i--) {
    if (valorMillions >= CREDITO_SCALE[i].min) return CREDITO_SCALE[i].color
  }
  return CREDITO_SCALE[0].color
}

export function CreditoRuralLayer() {
  const { municipiosGeoJSON } = useMapData()

  const { data: creditoMap, isLoading } = useQuery({
    queryKey: ['credito-rural-municipios-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'credito_rural_municipios_pr')
        .maybeSingle() as { data: { data: unknown } | null }

      if (!data?.data) return new Map<string, CreditoMunicipio>()

      const cached = data.data as { items?: CreditoMunicipio[] } | CreditoMunicipio[]
      const items = Array.isArray(cached) ? cached : (cached?.items || [])
      return new Map(items.map(m => [m.ibge_code, m]))
    },
    staleTime: 1000 * 60 * 60 * 24,
  })

  const hasData = useMemo(() => creditoMap && creditoMap.size > 0, [creditoMap])

  if (isLoading || !municipiosGeoJSON) return null
  if (!hasData) return null

  return (
    <GeoJSON
      key="credito-layer"
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const p = feature?.properties
        const ibge = String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
        const cred = creditoMap!.get(ibge)
        if (!cred) {
          return { fillColor: NO_DATA_COLOR, fillOpacity: 0.1, color: 'transparent', weight: 0 }
        }
        const valorMi = cred.valor_total / 1_000_000
        return {
          fillColor: creditoToColor(valorMi),
          fillOpacity: 0.55,
          color: 'transparent',
          weight: 0,
        }
      }}
    />
  )
}
