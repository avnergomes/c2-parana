// src/components/map/layers/CreditoRuralLayer.tsx
import { useMemo, useCallback } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMapData } from '@/contexts/MapDataContext'
import type { Feature } from 'geojson'
import type { Layer, LeafletEvent } from 'leaflet'

interface CreditoMunicipio {
  ibge_code: string
  municipio: string
  valor_total: number
  num_contratos: number
}

// Escala de roxos: mais escuro = mais crédito
const CREDITO_SCALE = [
  { min: 0, color: '#4c1d95' },
  { min: 10, color: '#5b21b6' },
  { min: 50, color: '#6d28d9' },
  { min: 100, color: '#7c3aed' },
  { min: 300, color: '#8b5cf6' },
  { min: 1000, color: '#a78bfa' },
]
const NO_DATA_COLOR = '#1f2937'

function creditoToColor(valorMillions: number): string {
  for (let i = CREDITO_SCALE.length - 1; i >= 0; i--) {
    if (valorMillions >= CREDITO_SCALE[i].min) return CREDITO_SCALE[i].color
  }
  return CREDITO_SCALE[0].color
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

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const ibge = getIbge(feature)
    const name = getName(feature)
    const cred = creditoMap?.get(ibge)

    const leafletLayer = layer as Layer & {
      bindTooltip: (content: string, opts?: object) => void
      setStyle: (s: object) => void
      bringToFront: () => void
    }

    if (cred) {
      const valor = formatBRL(cred.valor_total)
      leafletLayer.bindTooltip(
        `<div style="min-width:160px">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px">${name}</div>
          <div style="font-size:13px;font-weight:700;color:#a78bfa;font-family:monospace">${valor}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">${cred.num_contratos?.toLocaleString('pt-BR') || '—'} contratos</div>
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
          fillOpacity: cred ? 0.55 : 0.1,
          weight: 0,
          color: 'transparent',
        })
      },
    })
  }, [creditoMap])

  if (isLoading || !municipiosGeoJSON || !hasData) return null

  return (
    <GeoJSON
      key={`credito-layer-${creditoMap!.size}`}
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const ibge = getIbge(feature)
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
      onEachFeature={onEachFeature}
    />
  )
}
