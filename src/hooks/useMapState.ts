// src/hooks/useMapState.ts
import { useSearchParams } from 'react-router-dom'
import type { LayerId } from '@/types/mapa'

const DEFAULT_LAYERS: LayerId[] = ['clima']

export function useMapState() {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeLayers = (() => {
    const param = searchParams.get('layers')
    if (!param) return DEFAULT_LAYERS
    return param.split(',').filter(Boolean) as LayerId[]
  })()

  const selectedMunicipality = searchParams.get('municipio') || null

  const toggleLayer = (layerId: LayerId) => {
    const newLayers = activeLayers.includes(layerId)
      ? activeLayers.filter(l => l !== layerId)
      : [...activeLayers, layerId]

    setSearchParams(prev => {
      if (newLayers.length > 0) {
        prev.set('layers', newLayers.join(','))
      } else {
        prev.delete('layers')
      }
      return prev
    })
  }

  const selectMunicipality = (ibgeCode: string | null) => {
    setSearchParams(prev => {
      if (ibgeCode) {
        prev.set('municipio', ibgeCode)
      } else {
        prev.delete('municipio')
      }
      return prev
    })
  }

  return { activeLayers, selectedMunicipality, toggleLayer, selectMunicipality }
}
