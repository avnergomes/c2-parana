// src/hooks/useInfoHidroExpandido.ts
// Hooks for Phase 3.H expanded InfoHidro data (cached in data_cache)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface DataCacheRow {
  cache_key: string
  data: unknown
  fetched_at: string
}

function useCacheKey<T>(cacheKey: string, staleTime = 1000 * 60 * 60) {
  return useQuery({
    queryKey: ['infohidro-expanded', cacheKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', cacheKey)
        .single() as { data: DataCacheRow | null }

      if (!data?.data) return null

      const raw = data.data as { items?: T[] } | T[] | T
      return {
        items: Array.isArray(raw) ? raw : ((raw as { items?: T[] }).items || [raw as T]),
        fetchedAt: data.fetched_at,
      }
    },
    staleTime,
  })
}

export interface TelemetriaExpandida {
  sensors: unknown[]
  sensor_stations: unknown[]
  quality: unknown[]
  hourly_operations: unknown[]
}

export function useTelemetriaExpandida() {
  return useCacheKey<TelemetriaExpandida>('infohidro_telemetria_expandida', 1000 * 60 * 60 * 6)
}

export function useUsoSolo() {
  return useCacheKey<unknown>('infohidro_uso_solo', 1000 * 60 * 60 * 24)
}

export function useDesmatamento() {
  return useCacheKey<unknown>('infohidro_desmatamento_pr', 1000 * 60 * 60 * 24)
}

export function useQualidadeAgua() {
  return useCacheKey<unknown>('infohidro_qualidade_agua', 1000 * 60 * 60 * 6)
}

export function useFMAC() {
  return useCacheKey<unknown>('infohidro_fmac', 1000 * 60 * 60 * 24)
}

export function useHotspotsSimepar() {
  return useCacheKey<unknown>('infohidro_hotspots_pr', 1000 * 60 * 60 * 6)
}

export function useInfoHidroHealth() {
  return useCacheKey<{
    status: string
    sections_ok: number
    sections_total: number
    duration_seconds: number
    last_run: string
  }>('etl_health_infohidro', 1000 * 60 * 30)
}

/** Aggregated summary of all expanded InfoHidro data */
export function useInfoHidroExpandedSummary() {
  const telemetria = useTelemetriaExpandida()
  const usoSolo = useUsoSolo()
  const desmatamento = useDesmatamento()
  const qualidade = useQualidadeAgua()
  const fmac = useFMAC()
  const hotspots = useHotspotsSimepar()
  const health = useInfoHidroHealth()

  const isLoading = telemetria.isLoading || usoSolo.isLoading || desmatamento.isLoading

  // Count items in each section
  const telData = telemetria.data?.items[0] as TelemetriaExpandida | undefined
  const sensorsCount = Array.isArray(telData?.sensors) ? telData.sensors.length : 0
  const sensorStationsCount = Array.isArray(telData?.sensor_stations) ? telData.sensor_stations.length : 0
  const qualityCount = Array.isArray(telData?.quality) ? telData.quality.length : 0
  const hourlyCount = Array.isArray(telData?.hourly_operations) ? telData.hourly_operations.length : 0

  const usoSoloData = usoSolo.data?.items[0] as { classes?: unknown[]; landuse?: unknown[]; evolution?: unknown[] } | undefined
  const classesCount = Array.isArray(usoSoloData?.classes) ? usoSoloData.classes.length : 0
  const landuseCount = Array.isArray(usoSoloData?.landuse) ? usoSoloData.landuse.length : 0
  const evolutionCount = Array.isArray(usoSoloData?.evolution) ? usoSoloData.evolution.length : 0

  const desmatamentoCount = desmatamento.data?.items.length || 0
  const hotspotCount = hotspots.data?.items.length || 0

  const qualidadeData = qualidade.data?.items[0] as { estimativas_dbo?: unknown[] } | undefined
  const dboCount = Array.isArray(qualidadeData?.estimativas_dbo) ? qualidadeData.estimativas_dbo.length : 0

  const healthData = health.data?.items[0] as { status?: string; sections_ok?: number; sections_total?: number; duration_seconds?: number; last_run?: string } | undefined

  return {
    isLoading,
    sections: [
      { label: 'Tipos de sensor', count: sensorsCount, domain: 'telemetria' },
      { label: 'Mapeamentos sensor-estacao', count: sensorStationsCount, domain: 'telemetria' },
      { label: 'Qualidade dados', count: qualityCount, domain: 'telemetria' },
      { label: 'Operacoes horarias', count: hourlyCount, domain: 'telemetria' },
      { label: 'Classes uso do solo', count: classesCount, domain: 'conservacao' },
      { label: 'Localidades monitoradas', count: landuseCount, domain: 'conservacao' },
      { label: 'Series evolucao temporal', count: evolutionCount, domain: 'conservacao' },
      { label: 'Registros desmatamento', count: desmatamentoCount, domain: 'conservacao' },
      { label: 'Hotspots SIMEPAR', count: hotspotCount, domain: 'incendio' },
      { label: 'Estimativas DBO', count: dboCount, domain: 'qualidade' },
      { label: 'FMAC monitoramento', count: fmac.data ? 1 : 0, domain: 'ambiental' },
    ],
    health: healthData,
    lastFetch: telemetria.data?.fetchedAt || '',
  }
}
