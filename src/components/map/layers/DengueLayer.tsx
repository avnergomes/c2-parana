// src/components/map/layers/DengueLayer.tsx
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GeoJSON } from 'react-leaflet'
import { supabase } from '@/lib/supabase'
import { useMapData } from '@/contexts/MapDataContext'
import type { Feature } from 'geojson'
import type { Layer, LeafletEvent } from 'leaflet'

interface DengueData {
  ibge_code: string
  cases: number | null
  alert_level: number | null
  epidemiological_week: number | null
  year: number | null
}

const DENGUE_COLORS = ['#065f46', '#92400e', '#c2410c', '#7f1d1d']
const DENGUE_LABELS = ['Normal', 'Alerta', 'Moderado', 'Epidemia']
const NO_DATA_COLOR = '#1f2937'

function getIbge(feature: Feature | undefined): string {
  const p = feature?.properties
  return String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
}

function getName(feature: Feature | undefined): string {
  return String(feature?.properties?.NM_MUN || feature?.properties?.nome || '')
}

export function DengueLayer() {
  const { municipiosGeoJSON } = useMapData()

  const { data: dengueMap, isLoading } = useQuery({
    queryKey: ['dengue-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('ibge_code, cases, alert_level, epidemiological_week, year')
        .order('epidemiological_week', { ascending: false })
        .limit(399)

      const typedData = (data || []) as DengueData[]
      // Deduplicate by ibge_code (keep most recent)
      const map = new Map<string, DengueData>()
      for (const d of typedData) {
        if (!map.has(d.ibge_code)) map.set(d.ibge_code, d)
      }
      return map
    },
    staleTime: 1000 * 60 * 60,
  })

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const ibge = getIbge(feature)
    const name = getName(feature)
    const dengue = dengueMap?.get(ibge)

    const leafletLayer = layer as Layer & {
      bindTooltip: (content: string, opts?: object) => void
      setStyle: (s: object) => void
      bringToFront: () => void
    }

    if (dengue) {
      const level = (typeof dengue.alert_level === 'number' && dengue.alert_level >= 0 && dengue.alert_level <= 3) ? dengue.alert_level : 0
      const color = DENGUE_COLORS[level]
      const label = DENGUE_LABELS[level]
      const cases = dengue.cases ?? 0
      const week = dengue.epidemiological_week ? `SE${dengue.epidemiological_week}/${dengue.year}` : ''

      leafletLayer.bindTooltip(
        `<div style="min-width:150px">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px">${name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
            <span style="font-size:11px;font-weight:600">${label}</span>
          </div>
          <div style="font-size:10px;color:#d1d5db;font-family:monospace">${cases.toLocaleString('pt-BR')} casos ${week}</div>
        </div>`,
        { sticky: true, direction: 'top', offset: [0, -8] as [number, number], className: 'map-tooltip' }
      )
    }

    layer.on({
      mouseover: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        t.setStyle({ fillOpacity: 0.75, weight: 2, color: '#e5e7eb' })
        t.bringToFront()
      },
      mouseout: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        const d = dengueMap?.get(ibge)
        t.setStyle({
          fillOpacity: d ? 0.5 : 0.2,
          weight: 0,
          color: 'transparent',
        })
      },
    })
  }, [dengueMap])

  if (isLoading || !municipiosGeoJSON || !dengueMap) return null

  return (
    <GeoJSON
      key={`dengue-layer-${dengueMap.size}`}
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const ibge = getIbge(feature)
        const dengue = dengueMap.get(ibge)
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
      onEachFeature={onEachFeature}
    />
  )
}
