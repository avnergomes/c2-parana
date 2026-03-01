// src/components/map/MapContainer.tsx
import { useState } from 'react'
import { MapContainer as LeafletMap, TileLayer, GeoJSON, ZoomControl } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useMapState } from '@/hooks/useMapState'
import { LayerToggle } from './LayerToggle'
import { MapLegend } from './MapLegend'
import { MunicipalityPopup } from './MunicipalityPopup'
import { ClimaLayer } from './layers/ClimaLayer'
import { QueimadaLayer } from './layers/QueimadaLayer'
import { DengueLayer } from './layers/DengueLayer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { MapDataProvider } from '@/contexts/MapDataContext'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer } from 'leaflet'
import { useAuth } from '@/contexts/AuthContext'

// Paraná bounding box aproximado: -54.6,-26.7 / -48.0,-22.5
const PR_CENTER: [number, number] = [-24.89, -51.55]
const PR_BOUNDS: [[number, number], [number, number]] = [[-26.7, -54.6], [-22.5, -48.0]]

// Tile escuro via CartoDB
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO'

export function MapModule() {
  const { activeLayers, toggleLayer, selectMunicipality } = useMapState()
  const [selectedFeature, setSelectedFeature] = useState<{ ibge: string; name: string } | null>(null)
  const { isPro } = useAuth()

  // Carregar GeoJSON dos municípios
  const { data: geoJSON } = useQuery({
    queryKey: ['municipios-geojson'],
    queryFn: async () => {
      const res = await fetch('/data/municipios-pr.geojson')
      if (!res.ok) {
        // Fallback: IBGE direto
        const ibgeRes = await fetch('https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json')
        return ibgeRes.json() as Promise<GeoJsonObject>
      }
      return res.json() as Promise<GeoJsonObject>
    },
    staleTime: Infinity, // GeoJSON não muda
  })

  const onEachFeature = (feature: Feature, layer: Layer) => {
    layer.on({
      click: () => {
        const props = feature.properties
        const ibge = props?.CD_MUN || props?.geocodigo || props?.code
        const name = props?.NM_MUN || props?.nome || 'Município'
        setSelectedFeature({ ibge: String(ibge), name })
        selectMunicipality(String(ibge))
      },
      mouseover: (e) => {
        const target = e.target as Layer & { setStyle: (s: object) => void }
        target.setStyle({ fillOpacity: 0.5, weight: 2 })
      },
      mouseout: (e) => {
        const target = e.target as Layer & { setStyle: (s: object) => void }
        target.setStyle({ fillOpacity: 0.2, weight: 0.5 })
      },
    })
  }

  return (
    <MapDataProvider geoJSON={geoJSON || null}>
      <div className="relative h-full w-full">
        <LeafletMap
          center={PR_CENTER}
          zoom={7}
          zoomControl={false}
          maxBounds={PR_BOUNDS}
          maxBoundsViscosity={0.8}
          minZoom={6}
          maxZoom={13}
          className="h-full w-full"
          style={{ background: '#0f1117' }}
        >
          <ZoomControl position="bottomright" />

          {/* Tile escuro */}
          <TileLayer url={DARK_TILE} attribution={TILE_ATTRIBUTION} />

          {/* Municípios base (sempre visível) */}
          {geoJSON && (
            <GeoJSON
              key="municipios-base"
              data={geoJSON}
              style={() => ({
                fillColor: '#1f2937',
                fillOpacity: 0.3,
                color: '#374151',
                weight: 0.8,
              })}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Layer: Dengue (coroplético) */}
          {activeLayers.includes('dengue') && isPro && geoJSON && (
            <ErrorBoundary moduleName="layer dengue">
              <DengueLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Clima (marcadores) */}
          {activeLayers.includes('clima') && (
            <ErrorBoundary moduleName="layer clima">
              <ClimaLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Queimadas (pontos) */}
          {activeLayers.includes('queimadas') && isPro && (
            <ErrorBoundary moduleName="layer queimadas">
              <QueimadaLayer />
            </ErrorBoundary>
          )}
        </LeafletMap>

        {/* Controles sobrepostos */}
        <LayerToggle activeLayers={activeLayers} onToggle={toggleLayer} />
        <MapLegend activeLayers={activeLayers} />

        {selectedFeature && (
          <MunicipalityPopup
            ibgeCode={selectedFeature.ibge}
            name={selectedFeature.name}
            onClose={() => {
              setSelectedFeature(null)
              selectMunicipality(null)
            }}
          />
        )}
      </div>
    </MapDataProvider>
  )
}
