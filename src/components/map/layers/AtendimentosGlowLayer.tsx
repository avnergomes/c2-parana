// src/components/map/layers/AtendimentosGlowLayer.tsx
import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type L from 'leaflet'
import { useGetecAtendimentosDaily } from '@/hooks/useGetec'
import { GETEC_TO_IBGE } from '@/lib/getecMapping'

interface AtendimentosGlowLayerProps {
  timeFilter: string // ISO string from timeline slider
  geoJSON: GeoJsonObject | null
}

// Build reverse map: IBGE code → GETEC code
const IBGE_TO_GETEC: Record<string, string> = {}
for (const [getec, ibge] of Object.entries(GETEC_TO_IBGE)) {
  IBGE_TO_GETEC[ibge] = getec
}

/** Map an attendance count to a fill color (warm glow: transparent → yellow → orange) */
function countToColor(count: number): string {
  if (count <= 0) return 'transparent'
  if (count <= 2) return 'rgba(251, 191, 36, 0.25)' // amber light
  if (count <= 5) return 'rgba(251, 191, 36, 0.45)'
  if (count <= 10) return 'rgba(245, 158, 11, 0.55)'
  if (count <= 20) return 'rgba(245, 158, 11, 0.7)'
  return 'rgba(234, 88, 12, 0.8)' // orange-600
}

/** Distribute daily count across working hours (7-18h).
 *  Returns cumulative count at a given hour. */
function cumulativeAtHour(dailyCount: number, hour: number): number {
  if (hour < 7) return 0
  if (hour >= 18) return dailyCount
  const workHours = 11 // 7h to 18h
  const elapsed = hour - 7 + 1
  return Math.round(dailyCount * (elapsed / workHours))
}

export function AtendimentosGlowLayer({ timeFilter, geoJSON }: AtendimentosGlowLayerProps) {
  const { data: dailyMap } = useGetecAtendimentosDaily()

  // Extract date and hour from timeline position
  const { dateStr, hour } = useMemo(() => {
    const d = new Date(timeFilter)
    return {
      dateStr: timeFilter.split('T')[0],
      hour: d.getHours(),
    }
  }, [timeFilter])

  // Build IBGE → count map for the current date+hour
  const ibgeCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (!dailyMap) return map

    const dayData = dailyMap[dateStr]
    if (!dayData) return map

    for (const [getecCode, dailyCount] of Object.entries(dayData)) {
      const ibge = GETEC_TO_IBGE[getecCode]
      if (ibge) {
        const count = cumulativeAtHour(dailyCount, hour)
        if (count > 0) {
          map[ibge] = count
        }
      }
    }
    return map
  }, [dailyMap, dateStr, hour])

  // Only render if there's data to show
  const hasData = Object.keys(ibgeCountMap).length > 0

  const style = useMemo(() => {
    return (feature: Feature | undefined) => {
      if (!feature) return { fillOpacity: 0, weight: 0 }
      const props = feature.properties || {}
      const ibge = String(props.CD_MUN || props.codarea || props.geocodigo || '')
      const count = ibgeCountMap[ibge] || 0

      return {
        fillColor: countToColor(count),
        fillOpacity: count > 0 ? 1 : 0,
        color: count > 5 ? 'rgba(251, 191, 36, 0.6)' : 'transparent',
        weight: count > 5 ? 1.5 : 0,
      }
    }
  }, [ibgeCountMap])

  if (!geoJSON || !hasData) return null

  return (
    <GeoJSON
      key={`atend-glow-${dateStr}-${hour}`}
      data={geoJSON}
      style={style as L.StyleFunction}
      interactive={false}
      pane="overlayPane"
    />
  )
}
