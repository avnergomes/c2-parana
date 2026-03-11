// src/components/saude/DengueMapaCoro.tsx
import { useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useDengueAtual } from '@/hooks/useSaude'
import { DENGUE_ALERT_CONFIG } from '@/types/saude'
import type { Feature, GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'

const PR_CENTER: [number, number] = [-24.89, -51.55]
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

export function DengueMapaCoro() {
  const { data: dengueData } = useDengueAtual()

  const { data: geoJSON } = useQuery({
    queryKey: ['municipios-geojson-saude'],
    queryFn: async () => {
      const base = import.meta.env.BASE_URL || '/'
      const res = await fetch(`${base}data/municipios-pr.geojson`)
      if (!res.ok) {
        const r2 = await fetch('https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json')
        return r2.json()
      }
      return res.json()
    },
    staleTime: Infinity,
  })

  const dengueMap = useMemo(() => {
    const map = new Map<string, number>()
    dengueData?.forEach(d => map.set(d.ibge_code, d.alert_level))
    return map
  }, [dengueData])

  const getStyle = (feature?: Feature) => {
    const props = feature?.properties as { CD_MUN?: string; geocodigo?: string; codarea?: string } | undefined
    const ibge = String(props?.CD_MUN || props?.codarea || props?.geocodigo || '')
    const level = dengueMap.get(ibge) || 0
    const config = DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG]
    return {
      fillColor: config.color,
      fillOpacity: 0.55,
      color: '#374151',
      weight: 0.6,
    }
  }

  return (
    <div className="card overflow-hidden relative" style={{ height: 400 }}>
      <MapContainer
        center={PR_CENTER}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer url={DARK_TILE} attribution="" />
        {geoJSON && <GeoJSON key="dengue-coro" data={geoJSON as GeoJsonObject} style={getStyle} />}
      </MapContainer>

      {/* Legenda inline */}
      <div className="absolute bottom-3 left-3 bg-background-card/90 rounded p-2 flex gap-3 z-[1000]">
        {Object.entries(DENGUE_ALERT_CONFIG).map(([level, config]) => (
          <div key={level} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
            <span className="text-2xs text-text-secondary">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
