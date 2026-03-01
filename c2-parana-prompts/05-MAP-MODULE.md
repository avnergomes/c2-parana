# 05 — MAP MODULE: Mapa Central Leaflet

## Descrição
Implementa o mapa central interativo com Leaflet + React-Leaflet, carregamento do GeoJSON dos 399 municípios do Paraná, sistema de layers toggleáveis (Clima, Queimadas, Rios, Dengue, VBP), popup ao clicar no município, legenda dinâmica e persistência de estado na URL.

## Pré-requisitos
- Prompts 01, 02, 03 e 04 concluídos
- `municipios-pr.geojson` disponível (copiar do repositório vbp-parana ou baixar do IBGE)

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo de mapa central do C2 Paraná com Leaflet. Execute todos os passos.

## PASSO 1: Obter GeoJSON dos municípios do Paraná

Execute o script abaixo para baixar o GeoJSON do IBGE:

```bash
# Baixar GeoJSON dos municípios do PR do IBGE (resolução 5 = simplificada, boa para web)
curl "https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json" \
  -o public/data/municipios-pr-raw.geojson

# O arquivo do IBGE não tem nomes — precisamos enriquecer com dados adicionais
# Use o arquivo já processado com IBGE codes e nomes se disponível no repo vbp-parana
# Caso contrário, o GeoJSON do IBGE será usado diretamente
```

Alternativamente, crie public/data/municipios-pr.geojson com o GeoJSON enriquecido
(com propriedades: CD_MUN, NM_MUN, area_km2). O arquivo IBGE raw serve para o MVP.

## PASSO 2: Criar src/types/mapa.ts

```typescript
// src/types/mapa.ts
export type LayerId = 'clima' | 'queimadas' | 'rios' | 'dengue' | 'vbp' | 'credito'

export interface LayerConfig {
  id: LayerId
  label: string
  color: string
  plan: 'solo' | 'pro'
  description: string
}

export const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'clima', label: 'Clima', color: '#3b82f6', plan: 'solo', description: 'Estações meteorológicas' },
  { id: 'queimadas', label: 'Queimadas', color: '#ef4444', plan: 'pro', description: 'Focos de calor (FIRMS)' },
  { id: 'rios', label: 'Rios', color: '#06b6d4', plan: 'pro', description: 'Nível de rios (ANA)' },
  { id: 'dengue', label: 'Dengue', color: '#f59e0b', plan: 'pro', description: 'Alertas InfoDengue' },
  { id: 'vbp', label: 'VBP Agro', color: '#10b981', plan: 'pro', description: 'Valor Bruto da Produção' },
  { id: 'credito', label: 'Crédito Rural', color: '#8b5cf6', plan: 'pro', description: 'Crédito rural BCB' },
]

export interface MunicipalityData {
  ibge_code: string
  name: string
  clima?: {
    temperature?: number
    humidity?: number
    condition?: string
  }
  dengue?: {
    cases?: number
    alert_level?: number
  }
  fires?: number
  vbp?: number
  river_alert?: string
}
```

## PASSO 3: Criar src/hooks/useMapState.ts

```typescript
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
```

## PASSO 4: Criar src/components/map/LayerToggle.tsx

```typescript
// src/components/map/LayerToggle.tsx
import { LAYER_CONFIGS, type LayerId } from '@/types/mapa'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

interface LayerToggleProps {
  activeLayers: LayerId[]
  onToggle: (layerId: LayerId) => void
}

export function LayerToggle({ activeLayers, onToggle }: LayerToggleProps) {
  const { isPro } = useAuth()

  return (
    <div className="absolute top-4 left-4 z-[1000] card p-3 min-w-[160px] shadow-card-hover">
      <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-2">Camadas</p>
      <div className="space-y-1.5">
        {LAYER_CONFIGS.map(layer => {
          const locked = layer.plan === 'pro' && !isPro
          const active = activeLayers.includes(layer.id)

          return (
            <button
              key={layer.id}
              onClick={() => !locked && onToggle(layer.id)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-all',
                locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-background-elevated cursor-pointer',
                active && !locked ? 'bg-background-elevated' : ''
              )}
              title={locked ? 'Disponível no plano Pro' : layer.description}
            >
              <span
                className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', active && !locked ? 'ring-2 ring-white/20' : 'opacity-40')}
                style={{ backgroundColor: layer.color }}
              />
              <span className={cn('text-xs font-medium', active && !locked ? 'text-text-primary' : 'text-text-secondary')}>
                {layer.label}
              </span>
              {locked && <span className="ml-auto text-text-muted text-2xs">Pro</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

## PASSO 5: Criar src/components/map/MapLegend.tsx

```typescript
// src/components/map/MapLegend.tsx
import type { LayerId } from '@/types/mapa'

const DENGUE_LEGEND = [
  { color: '#10b981', label: 'Verde — sem alerta' },
  { color: '#f59e0b', label: 'Amarelo — alerta leve' },
  { color: '#f97316', label: 'Laranja — alerta moderado' },
  { color: '#ef4444', label: 'Vermelho — epidemia' },
]

interface MapLegendProps {
  activeLayers: LayerId[]
}

export function MapLegend({ activeLayers }: MapLegendProps) {
  if (!activeLayers.includes('dengue') && !activeLayers.includes('vbp')) return null

  return (
    <div className="absolute bottom-8 right-4 z-[1000] card p-3 space-y-3 max-w-[180px] shadow-card-hover">
      {activeLayers.includes('dengue') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Dengue</p>
          {DENGUE_LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-2xs text-text-secondary">{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {activeLayers.includes('vbp') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">VBP Agro (R$ mi)</p>
          <div className="h-3 w-full rounded" style={{ background: 'linear-gradient(to right, #064e3b, #10b981, #d1fae5)' }} />
          <div className="flex justify-between mt-0.5">
            <span className="text-2xs text-text-muted">Baixo</span>
            <span className="text-2xs text-text-muted">Alto</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

## PASSO 6: Criar src/components/map/MunicipalityPopup.tsx

```typescript
// src/components/map/MunicipalityPopup.tsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/SkeletonCard'

interface MunicipalityPopupProps {
  ibgeCode: string
  name: string
  onClose: () => void
}

export function MunicipalityPopup({ ibgeCode, name, onClose }: MunicipalityPopupProps) {
  // Buscar dados consolidados do município
  const { data: climaData } = useQuery({
    queryKey: ['muni-clima', ibgeCode],
    queryFn: async () => {
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, humidity, wind_speed, observed_at')
        .eq('ibge_code', ibgeCode)
        .order('observed_at', { ascending: false })
        .limit(1)
        .single()
      return data
    },
    staleTime: 1000 * 60 * 10,
  })

  const { data: dengueData } = useQuery({
    queryKey: ['muni-dengue', ibgeCode],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('cases, alert_level, epidemiological_week, year')
        .eq('ibge_code', ibgeCode)
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .single()
      return data
    },
  })

  const { data: fireCount } = useQuery({
    queryKey: ['muni-fires', ibgeCode],
    queryFn: async () => {
      const { count } = await supabase
        .from('fire_spots')
        .select('*', { count: 'exact', head: true })
        .eq('ibge_code', ibgeCode)
        .gte('acq_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      return count || 0
    },
  })

  const dengueColors = ['#10b981', '#f59e0b', '#f97316', '#ef4444']
  const dengueLabels = ['Normal', 'Alerta', 'Moderado', 'Epidemia']

  return (
    <div className="absolute top-4 right-4 z-[1000] card p-4 w-64 shadow-card-hover animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary leading-tight">{name}</h3>
          <p className="text-2xs text-text-muted font-mono">IBGE {ibgeCode}</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none ml-2 mt-0.5">×</button>
      </div>

      <div className="space-y-3">
        {/* Clima */}
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1">Clima</p>
          {climaData ? (
            <div className="grid grid-cols-3 gap-1">
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.temperature?.toFixed(1)}°</p>
                <p className="text-2xs text-text-muted">Temp.</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.humidity?.toFixed(0)}%</p>
                <p className="text-2xs text-text-muted">Umid.</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.wind_speed?.toFixed(1)}</p>
                <p className="text-2xs text-text-muted">m/s</p>
              </div>
            </div>
          ) : (
            <p className="text-2xs text-text-muted">Sem dados de estação próxima</p>
          )}
        </div>

        {/* Dengue */}
        {dengueData && (
          <div>
            <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1">Dengue</p>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dengueColors[dengueData.alert_level || 0] }}
              />
              <span className="text-xs text-text-secondary">
                {dengueLabels[dengueData.alert_level || 0]} — {dengueData.cases} casos (SE{dengueData.epidemiological_week}/{dengueData.year})
              </span>
            </div>
          </div>
        )}

        {/* Focos de calor */}
        {(fireCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-danger" />
            <span className="text-xs text-text-secondary">{fireCount} focos de calor (7 dias)</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

## PASSO 7: Criar src/components/map/layers/DengueLayer.tsx

```typescript
// src/components/map/layers/DengueLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { GeoJSON } from 'react-leaflet'
import { supabase } from '@/lib/supabase'
import type { GeoJsonObject } from 'geojson'

// O GeoJSON dos municípios deve estar disponível globalmente
declare global {
  interface Window {
    municipiosGeoJSON?: GeoJsonObject
  }
}

export function DengueLayer() {
  const { data: dengueMap } = useQuery({
    queryKey: ['dengue-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('ibge_code, cases, alert_level')
        .order('epidemiological_week', { ascending: false })
        .limit(399)  // um por município
      return Object.fromEntries((data || []).map(d => [d.ibge_code, d]))
    },
    staleTime: 1000 * 60 * 60, // 1h
  })

  if (!dengueMap) return null

  const DENGUE_COLORS = ['#065f46', '#92400e', '#c2410c', '#7f1d1d']

  return (
    <GeoJSON
      key="dengue-layer"
      data={window.municipiosGeoJSON as any}
      style={(feature) => {
        const ibge = feature?.properties?.CD_MUN || feature?.properties?.geocodigo
        const dengue = dengueMap[ibge]
        const level = dengue?.alert_level || 0
        return {
          fillColor: DENGUE_COLORS[level],
          fillOpacity: 0.5,
          color: 'transparent',
          weight: 0,
        }
      }}
    />
  )
}
```

## PASSO 8: Criar src/components/map/layers/QueimadaLayer.tsx

```typescript
// src/components/map/layers/QueimadaLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { supabase } from '@/lib/supabase'

export function QueimadaLayer() {
  const { data: fires } = useQuery({
    queryKey: ['fire-spots-map'],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('latitude, longitude, brightness, acq_date, municipality')
        .gte('acq_date', sevenDaysAgo)
        .limit(2000)
      return data || []
    },
    staleTime: 1000 * 60 * 30,
  })

  return (
    <>
      {fires?.map((fire, i) => (
        <CircleMarker
          key={`fire-${i}`}
          center={[fire.latitude, fire.longitude]}
          radius={4}
          pathOptions={{
            fillColor: '#ef4444',
            fillOpacity: 0.8,
            color: '#dc2626',
            weight: 1,
          }}
        >
          <Tooltip>
            <div className="text-xs">
              <p className="font-semibold">{fire.municipality || 'Foco de calor'}</p>
              <p>Brilho: {fire.brightness?.toFixed(0)}K</p>
              <p>{fire.acq_date}</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
```

## PASSO 9: Criar src/components/map/layers/ClimaLayer.tsx

```typescript
// src/components/map/layers/ClimaLayer.tsx
import { useQuery } from '@tanstack/react-query'
import { Marker, Tooltip } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { supabase } from '@/lib/supabase'

function tempToColor(temp: number): string {
  if (temp < 10) return '#60a5fa'
  if (temp < 18) return '#34d399'
  if (temp < 25) return '#fbbf24'
  if (temp < 32) return '#f97316'
  return '#ef4444'
}

export function ClimaLayer() {
  const { data: stations } = useQuery({
    queryKey: ['climate-map-markers'],
    queryFn: async () => {
      // Pegar leitura mais recente de cada estação
      const { data } = await supabase
        .from('climate_data')
        .select('station_code, station_name, latitude, longitude, temperature, humidity, observed_at')
        .not('latitude', 'is', null)
        .order('observed_at', { ascending: false })
        .limit(60)
      
      // Deduplicate por station_code
      const seen = new Set<string>()
      return (data || []).filter(s => {
        if (seen.has(s.station_code)) return false
        seen.add(s.station_code)
        return true
      })
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
  })

  return (
    <>
      {stations?.map(station => {
        if (!station.latitude || !station.longitude) return null
        const color = tempToColor(station.temperature || 20)
        const icon = divIcon({
          className: '',
          html: `<div style="
            background: ${color};
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 4px;
            padding: 2px 5px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 600;
            color: white;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          ">${station.temperature?.toFixed(1)}°</div>`,
          iconAnchor: [20, 10],
        })

        return (
          <Marker
            key={station.station_code}
            position={[station.latitude, station.longitude]}
            icon={icon}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              <div className="text-xs space-y-0.5 min-w-[140px]">
                <p className="font-semibold">{station.station_name}</p>
                <p>Temp: <span className="font-mono">{station.temperature?.toFixed(1)}°C</span></p>
                <p>Umidade: <span className="font-mono">{station.humidity?.toFixed(0)}%</span></p>
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
```

## PASSO 10: Criar src/components/map/MapContainer.tsx (componente principal)

```typescript
// src/components/map/MapContainer.tsx
import { useState, useEffect, useRef } from 'react'
import { MapContainer as LeafletMap, TileLayer, GeoJSON, ZoomControl, useMap } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useMapState } from '@/hooks/useMapState'
import { LayerToggle } from './LayerToggle'
import { MapLegend } from './MapLegend'
import { MunicipalityPopup } from './MunicipalityPopup'
import { ClimaLayer } from './layers/ClimaLayer'
import { QueimadaLayer } from './layers/QueimadaLayer'
import { DengueLayer } from './layers/DengueLayer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { GeoJsonObject, Feature } from 'geojson'
import { useAuth } from '@/contexts/AuthContext'

// Paraná bounding box aproximado: -54.6,-26.7 / -48.0,-22.5
const PR_CENTER: [number, number] = [-24.89, -51.55]
const PR_BOUNDS: [[number, number], [number, number]] = [[-26.7, -54.6], [-22.5, -48.0]]

// Tile escuro via CartoDB
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO'

export function MapPage() {
  const { activeLayers, selectedMunicipality, toggleLayer, selectMunicipality } = useMapState()
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
      const data = await res.json() as GeoJsonObject
      // Salvar referência global para as layers
      window.municipiosGeoJSON = data
      return data
    },
    staleTime: Infinity, // GeoJSON não muda
  })

  const onEachFeature = (feature: Feature, layer: L.Layer) => {
    layer.on({
      click: () => {
        const props = feature.properties
        const ibge = props?.CD_MUN || props?.geocodigo || props?.code
        const name = props?.NM_MUN || props?.nome || 'Município'
        setSelectedFeature({ ibge: String(ibge), name })
        selectMunicipality(String(ibge))
      },
      mouseover: (e) => {
        const target = e.target as any
        target.setStyle({ fillOpacity: 0.5, weight: 2 })
      },
      mouseout: (e) => {
        const target = e.target as any
        target.setStyle({ fillOpacity: 0.2, weight: 0.5 })
      },
    })
  }

  return (
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
  )
}
```

## PASSO 11: Atualizar src/pages/MapPage.tsx

```typescript
// src/pages/MapPage.tsx
import { Suspense } from 'react'
import { MapPage as MapModule } from '@/components/map/MapContainer'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export function MapPage() {
  return (
    <div className="h-[calc(100vh-56px)] w-full">
      <Suspense fallback={<LoadingScreen />}>
        <MapModule />
      </Suspense>
    </div>
  )
}
```

## PASSO 12: Corrigir ícone padrão do Leaflet

No src/lib/utils.ts, adicione no final:

```typescript
// Fix para ícones padrão do Leaflet com Vite
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})
```

Importe esse utilitário no main.tsx: `import '@/lib/leaflet-fix'`

Crie src/lib/leaflet-fix.ts com o conteúdo acima.
```

---

## Arquivos Criados/Modificados

```
src/
├── types/mapa.ts                         (CRIADO)
├── hooks/useMapState.ts                  (CRIADO)
├── lib/leaflet-fix.ts                    (CRIADO)
├── components/map/
│   ├── MapContainer.tsx                  (CRIADO)
│   ├── LayerToggle.tsx                   (CRIADO)
│   ├── MapLegend.tsx                     (CRIADO)
│   ├── MunicipalityPopup.tsx             (CRIADO)
│   └── layers/
│       ├── ClimaLayer.tsx                (CRIADO)
│       ├── QueimadaLayer.tsx             (CRIADO)
│       └── DengueLayer.tsx               (CRIADO)
└── pages/MapPage.tsx                     (SUBSTITUÍDO)
public/data/municipios-pr.geojson         (BAIXADO do IBGE)
```

---

## Verificação

1. Navegar para `/mapa` → mapa dark do Paraná com municípios visíveis
2. Clicar em um município → popup lateral com dados
3. Toggle de camadas: ativar/desativar Clima → marcadores de temperatura aparecem/somem
4. URL muda ao selecionar município: `?municipio=4106902&layers=clima`
5. Recarregar a página com URL params → estado é restaurado

---

## Notas Técnicas

- **Tile dark mode**: Usando CartoDB Dark Matter (`dark_all`) — não precisa de API key para uso básico. Alternativa: Stadia Maps Alidade Smooth Dark (requer key gratuita).
- **GeoJSON do IBGE**: Resolução 5 é simplificada (~500KB). Resolução 2 é mais detalhada (~2MB). Para MVP, usar resolução 5.
- **Performance**: Para 399 municípios, o GeoJSON raw pode ter 1-2MB. Gzip reduz para ~300KB. O `staleTime: Infinity` evita refetch desnecessário.
- **Layers pro bloqueadas**: O LayerToggle mostra as camadas pro como desabilitadas visualmente. Mesmo que o usuário manipule a URL manualmente, os dados não são carregados pois `isPro` é false.
- **Declaração global `window.municipiosGeoJSON`**: Hack necessário para compartilhar o GeoJSON já carregado entre múltiplas layers sem fazer fetch duplicado. Uma solução mais clean seria um Context ou Zustand store.
