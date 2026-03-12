// src/components/map/layers/VbpLayer.tsx
import { useMemo, useCallback } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useMapData } from '@/contexts/MapDataContext'
import { useVbpMunicipios } from '@/hooks/useAgro'
import type { Feature } from 'geojson'
import type { Layer, LeafletEvent } from 'leaflet'

interface VbpMuniEntry {
  ibge_code: string
  municipio?: string
  nome?: string
  vbp_total: number
  vbp_lavoura?: number
  vbp_pecuaria?: number
}

// Escala de verdes: mais escuro = VBP maior
const VBP_SCALE = [
  { min: 0, color: '#064e3b', label: '< 50M' },
  { min: 50, color: '#065f46', label: '50-200M' },
  { min: 200, color: '#047857', label: '200-500M' },
  { min: 500, color: '#059669', label: '500M-1B' },
  { min: 1000, color: '#10b981', label: '1-2B' },
  { min: 2000, color: '#34d399', label: '2B+' },
]
const NO_DATA_COLOR = '#1f2937'

function vbpToColor(valorMillions: number): string {
  for (let i = VBP_SCALE.length - 1; i >= 0; i--) {
    if (valorMillions >= VBP_SCALE[i].min) return VBP_SCALE[i].color
  }
  return VBP_SCALE[0].color
}

function formatBRL(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return `R$ ${value.toFixed(0)}`
}

function getIbge(feature: Feature | undefined): string {
  const p = feature?.properties
  return String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
}

function getName(feature: Feature | undefined): string {
  return String(feature?.properties?.NM_MUN || feature?.properties?.nome || '')
}

export function VbpLayer() {
  const { municipiosGeoJSON } = useMapData()
  const { data: municipios, isLoading } = useVbpMunicipios()

  const vbpMap = useMemo(() => {
    if (!municipios?.length) return new Map<string, VbpMuniEntry>()
    return new Map(municipios.map(m => [m.ibge_code, m as VbpMuniEntry]))
  }, [municipios])

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const ibge = getIbge(feature)
    const name = getName(feature)
    const entry = vbpMap.get(ibge)

    const leafletLayer = layer as Layer & {
      bindTooltip: (content: string, opts?: object) => void
      setStyle: (s: object) => void
      bringToFront: () => void
    }

    if (entry) {
      const valor = formatBRL(entry.vbp_total)
      leafletLayer.bindTooltip(
        `<div style="min-width:160px">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px">${name}</div>
          <div style="font-size:13px;font-weight:700;color:#34d399;font-family:monospace">${valor}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">VBP Agropecuário</div>
        </div>`,
        { sticky: true, direction: 'top', offset: [0, -8] as [number, number], className: 'map-tooltip' }
      )
    }

    layer.on({
      mouseover: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        t.setStyle({ fillOpacity: 0.8, weight: 2, color: '#e5e7eb' })
        t.bringToFront()
      },
      mouseout: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        t.setStyle({
          fillOpacity: entry ? 0.55 : 0.1,
          weight: 0,
          color: 'transparent',
        })
      },
    })
  }, [vbpMap])

  if (isLoading || !municipiosGeoJSON || vbpMap.size === 0) return null

  return (
    <GeoJSON
      key={`vbp-layer-${vbpMap.size}`}
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const ibge = getIbge(feature)
        const entry = vbpMap.get(ibge)
        if (!entry) {
          return { fillColor: NO_DATA_COLOR, fillOpacity: 0.1, color: 'transparent', weight: 0 }
        }
        const valorMi = entry.vbp_total / 1_000_000
        return {
          fillColor: vbpToColor(valorMi),
          fillOpacity: 0.55,
          color: 'transparent',
          weight: 0,
        }
      }}
      onEachFeature={onEachFeature}
    />
  )
}
