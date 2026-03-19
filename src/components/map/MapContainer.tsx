// src/components/map/MapContainer.tsx
import { useState, useCallback, useRef } from 'react'
import { MapContainer as LeafletMap, TileLayer, GeoJSON, ZoomControl } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useMapState } from '@/hooks/useMapState'
import { LayerToggle } from './LayerToggle'
import { MapLegend } from './MapLegend'
import { MunicipalityPopup } from './MunicipalityPopup'
import { COPStatusPanel } from './COPStatusPanel'
import { TimelineSlider } from './TimelineSlider'
import { ClimaLayer } from './layers/ClimaLayer'
import { QueimadaLayer } from './layers/QueimadaLayer'
import { DengueLayer } from './layers/DengueLayer'
import { IRTCLayer } from './layers/IRTCLayer'
import { VbpLayer } from './layers/VbpLayer'
import { CreditoRuralLayer } from './layers/CreditoRuralLayer'
import { RiosLayer } from './layers/RiosLayer'
import { ReservatoriosLayer } from './layers/ReservatoriosLayer'
import { ManancialAlertsLayer } from './layers/ManancialAlertsLayer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { MapDataProvider } from '@/contexts/MapDataContext'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer, LeafletEvent } from 'leaflet'
import { useAuth } from '@/contexts/AuthContext'

// Paraná bounding box aproximado: -54.6,-26.7 / -48.0,-22.5
const PR_CENTER: [number, number] = [-24.89, -51.55]
const PR_BOUNDS: [[number, number], [number, number]] = [[-26.7, -54.6], [-22.5, -48.0]]

// Tile escuro via CartoDB
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO'

const BASE_STYLE = {
  fillColor: '#1f2937',
  fillOpacity: 0.3,
  color: '#374151',
  weight: 0.8,
}

const HOVER_STYLE = {
  fillOpacity: 0.55,
  color: '#6b7280',
  weight: 2,
}

function getFeatureIbge(feature: Feature | undefined): string {
  const p = feature?.properties
  return String(p?.CD_MUN || p?.codarea || p?.geocodigo || p?.code || '')
}

function getFeatureName(feature: Feature | undefined): string {
  const p = feature?.properties
  return String(p?.NM_MUN || p?.nome || 'Município')
}

export function MapModule() {
  const { activeLayers, toggleLayer, selectMunicipality } = useMapState()
  const [selectedFeature, setSelectedFeature] = useState<{ ibge: string; name: string } | null>(null)
  const { isPro } = useAuth()
  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  // Timeline state
  const [timelineValue, setTimelineValue] = useState<string>(new Date().toISOString())
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false)

  // Carregar GeoJSON dos municípios
  const { data: geoJSON } = useQuery({
    queryKey: ['municipios-geojson'],
    queryFn: async () => {
      try {
        const base = import.meta.env.BASE_URL || '/'
        const res = await fetch(`${base}data/municipios-pr.geojson`)
        if (!res.ok) {
          // Fallback: IBGE direto
          const ibgeRes = await fetch('https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json')
          if (!ibgeRes.ok) {
            console.error(`GeoJSON fallback failed: IBGE returned ${ibgeRes.status}`)
            return null
          }
          return ibgeRes.json() as Promise<GeoJsonObject>
        }
        return res.json() as Promise<GeoJsonObject>
      } catch (err) {
        console.error('Failed to load GeoJSON for municipalities:', err)
        return null
      }
    },
    staleTime: Infinity, // GeoJSON não muda
  })

  const onEachFeature = useCallback((feature: Feature, layer: Layer) => {
    const name = getFeatureName(feature)
    const ibge = getFeatureIbge(feature)

    // Bind tooltip with municipality name
    const leafletLayer = layer as Layer & {
      bindTooltip: (content: string, opts?: object) => void
      setStyle: (s: object) => void
    }
    leafletLayer.bindTooltip(
      `<div style="font-size:12px;font-weight:600;line-height:1.3">${name}</div><div style="font-size:10px;color:#9ca3af;font-family:monospace">${ibge}</div>`,
      {
        sticky: true,
        direction: 'top' as const,
        offset: [0, -8] as [number, number],
        className: 'map-tooltip',
      }
    )

    layer.on({
      click: () => {
        setSelectedFeature({ ibge, name })
        selectMunicipality(ibge)
      },
      mouseover: (e: LeafletEvent) => {
        const target = e.target as Layer & { setStyle: (s: object) => void; bringToFront: () => void }
        target.setStyle(HOVER_STYLE)
        target.bringToFront()
      },
      mouseout: (e: LeafletEvent) => {
        const target = e.target as Layer & { setStyle: (s: object) => void }
        target.setStyle(BASE_STYLE)
      },
    })
  }, [selectMunicipality])

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

          {/* Municípios base (sempre visível) — com tooltips */}
          {geoJSON && (
            <GeoJSON
              key="municipios-base"
              ref={geoJsonRef as any}
              data={geoJSON}
              style={() => BASE_STYLE}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Layer: Dengue (coroplético com tooltips) */}
          {activeLayers.includes('dengue') && isPro && geoJSON && (
            <ErrorBoundary moduleName="layer dengue">
              <DengueLayer />
            </ErrorBoundary>
          )}

          {/* Layer: VBP Agro (coroplético com tooltips) */}
          {activeLayers.includes('vbp') && isPro && geoJSON && (
            <ErrorBoundary moduleName="layer vbp">
              <VbpLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Crédito Rural (coroplético com tooltips) */}
          {activeLayers.includes('credito') && isPro && geoJSON && (
            <ErrorBoundary moduleName="layer credito rural">
              <CreditoRuralLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Clima (marcadores) */}
          {activeLayers.includes('clima') && (
            <ErrorBoundary moduleName="layer clima">
              <ClimaLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Rios (marcadores de estações fluviométricas) */}
          {activeLayers.includes('rios') && isPro && (
            <ErrorBoundary moduleName="layer rios">
              <RiosLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Reservatórios (marcadores) */}
          {activeLayers.includes('reservatorios') && isPro && (
            <ErrorBoundary moduleName="layer reservatorios">
              <ReservatoriosLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Alertas Hídricos (mananciais em alerta) */}
          {activeLayers.includes('alertas_hidricos') && isPro && (
            <ErrorBoundary moduleName="layer alertas hidricos">
              <ManancialAlertsLayer />
            </ErrorBoundary>
          )}

          {/* Layer: Queimadas (pontos) */}
          {activeLayers.includes('queimadas') && isPro && (
            <ErrorBoundary moduleName="layer queimadas">
              <QueimadaLayer />
            </ErrorBoundary>
          )}

          {/* Layer: IRTC - Índice de Risco Territorial Composto (coroplético) */}
          {activeLayers.includes('irtc') && isPro && geoJSON && (
            <ErrorBoundary moduleName="layer irtc">
              <IRTCLayer />
            </ErrorBoundary>
          )}
        </LeafletMap>

        {/* Controles sobrepostos */}
        <LayerToggle activeLayers={activeLayers} onToggle={toggleLayer} />
        <MapLegend activeLayers={activeLayers} />

        {/* COP Status Panel (painel operacional direito) */}
        {isPro && (
          <ErrorBoundary moduleName="cop status panel">
            <COPStatusPanel
              onMunicipalityClick={(ibge) => {
                setSelectedFeature({ ibge, name: '' })
                selectMunicipality(ibge)
              }}
            />
          </ErrorBoundary>
        )}

        {/* Timeline Slider (controle temporal inferior) */}
        {isPro && (
          <TimelineSlider
            value={timelineValue}
            onChange={setTimelineValue}
            isPlaying={isTimelinePlaying}
            onTogglePlay={() => setIsTimelinePlaying(p => !p)}
          />
        )}

        {/* Painel lateral de situação do município */}
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
