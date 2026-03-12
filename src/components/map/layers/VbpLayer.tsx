// src/components/map/layers/VbpLayer.tsx
import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useMapData } from '@/contexts/MapDataContext'
import { useVbpMunicipios } from '@/hooks/useAgro'
import type { Feature } from 'geojson'

// Escala de verdes: mais escuro = VBP maior
const VBP_SCALE = [
  { min: 0, color: '#064e3b' },       // < 50M
  { min: 50, color: '#065f46' },       // 50-200M
  { min: 200, color: '#047857' },      // 200-500M
  { min: 500, color: '#059669' },      // 500M-1B
  { min: 1000, color: '#10b981' },     // 1B-2B
  { min: 2000, color: '#34d399' },     // 2B+
]
const NO_DATA_COLOR = '#1f2937'

function vbpToColor(valorMillions: number): string {
  for (let i = VBP_SCALE.length - 1; i >= 0; i--) {
    if (valorMillions >= VBP_SCALE[i].min) return VBP_SCALE[i].color
  }
  return VBP_SCALE[0].color
}

export function VbpLayer() {
  const { municipiosGeoJSON } = useMapData()
  const { data: municipios, isLoading } = useVbpMunicipios()

  const vbpMap = useMemo(() => {
    if (!municipios?.length) return new Map<string, number>()
    return new Map(municipios.map(m => [m.ibge_code, m.vbp_total]))
  }, [municipios])

  if (isLoading || !municipiosGeoJSON) return null
  if (vbpMap.size === 0) return null

  return (
    <GeoJSON
      key="vbp-layer"
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const p = feature?.properties
        const ibge = String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
        const vbp = vbpMap.get(ibge)
        if (vbp == null) {
          return { fillColor: NO_DATA_COLOR, fillOpacity: 0.1, color: 'transparent', weight: 0 }
        }
        const valorMi = vbp / 1_000_000
        return {
          fillColor: vbpToColor(valorMi),
          fillOpacity: 0.55,
          color: 'transparent',
          weight: 0,
        }
      }}
    />
  )
}
