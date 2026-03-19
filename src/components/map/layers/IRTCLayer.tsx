// src/components/map/layers/IRTCLayer.tsx
import { useCallback } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useMapData } from '@/contexts/MapDataContext'
import { useIRTC, getIRTCColor } from '@/hooks/useIRTC'
import type { Feature } from 'geojson'
import type { Layer, LeafletEvent } from 'leaflet'

function getIbge(feature: Feature | undefined): string {
  const p = feature?.properties
  return String(p?.CD_MUN || p?.codarea || p?.geocodigo || '')
}

function getName(feature: Feature | undefined): string {
  return String(feature?.properties?.NM_MUN || feature?.properties?.nome || '')
}

function getRiskLabel(irtc: number): string {
  if (irtc <= 25) return 'Baixo'
  if (irtc <= 50) return 'Médio'
  if (irtc <= 75) return 'Alto'
  return 'Crítico'
}

function getDominantRiskFactor(result: any): string {
  const factors = [
    { label: 'Clima', value: result.rClima },
    { label: 'Saúde', value: result.rSaude },
    { label: 'Ambiente', value: result.rAmbiente },
    { label: 'Hidro', value: result.rHidro },
    { label: 'Ar', value: result.rAr },
  ]
  const dominant = factors.reduce((a, b) => (b.value > a.value ? b : a))
  return dominant.label
}

export function IRTCLayer() {
  const { municipiosGeoJSON } = useMapData()
  const { data: irtcMap, isLoading } = useIRTC()

  const getOpacityForScore = (score: number): number => {
    // Scale from 0.2 (low risk) to 0.7 (high risk)
    return 0.2 + (score / 100) * 0.5
  }

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const ibge = getIbge(feature)
    const name = getName(feature)
    const irtcResult = irtcMap?.get(ibge)

    const leafletLayer = layer as Layer & {
      bindTooltip: (content: string, opts?: object) => void
      setStyle: (s: object) => void
      bringToFront: () => void
    }

    if (irtcResult) {
      const riskLabel = getRiskLabel(irtcResult.irtc)
      const dominantFactor = getDominantRiskFactor(irtcResult)
      const color = getIRTCColor(irtcResult.irtc)

      leafletLayer.bindTooltip(
        `<div style="min-width:180px">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px">${name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
            <span style="font-size:11px;font-weight:600">${riskLabel} (${irtcResult.irtc.toFixed(1)})</span>
          </div>
          <div style="font-size:10px;color:#d1d5db;margin-bottom:3px">Fator dominante: ${dominantFactor}</div>
          <div style="font-size:9px;color:#6b7280;font-family:monospace">
            Clima: ${irtcResult.rClima.toFixed(1)} | Saúde: ${irtcResult.rSaude.toFixed(1)}<br/>
            Ambiente: ${irtcResult.rAmbiente.toFixed(1)} | Hidro: ${irtcResult.rHidro.toFixed(1)}
          </div>
        </div>`,
        { sticky: true, direction: 'top', offset: [0, -8] as [number, number], className: 'map-tooltip' }
      )
    }

    layer.on({
      mouseover: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        const result = irtcMap?.get(ibge)
        const opacity = result ? getOpacityForScore(result.irtc) : 0.2
        t.setStyle({ fillOpacity: Math.min(opacity + 0.15, 0.85), weight: 2, color: '#e5e7eb' })
        t.bringToFront()
      },
      mouseout: (e: LeafletEvent) => {
        const t = e.target as typeof leafletLayer
        const result = irtcMap?.get(ibge)
        t.setStyle({
          fillOpacity: result ? getOpacityForScore(result.irtc) : 0.2,
          weight: 0,
          color: 'transparent',
        })
      },
    })
  }, [irtcMap])

  if (isLoading || !municipiosGeoJSON || !irtcMap) return null

  return (
    <GeoJSON
      key={`irtc-layer-${irtcMap.size}`}
      data={municipiosGeoJSON}
      style={(feature: Feature | undefined) => {
        const ibge = getIbge(feature)
        const irtcResult = irtcMap.get(ibge)
        if (!irtcResult) {
          return { fillColor: '#1f2937', fillOpacity: 0.2, color: 'transparent', weight: 0 }
        }
        const opacity = getOpacityForScore(irtcResult.irtc)
        return {
          fillColor: getIRTCColor(irtcResult.irtc),
          fillOpacity: opacity,
          color: 'transparent',
          weight: 0,
        }
      }}
      onEachFeature={onEachFeature}
    />
  )
}
