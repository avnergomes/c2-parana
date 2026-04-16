// src/hooks/useReconhecimento.ts
// Fase 5.D — agrega dados multi-domínio de um município para a página de Reconhecimento
import { useQueries } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ReconhecimentoSnapshot {
  irtc: {
    score: number | null
    level: string | null
    rClima: number | null
    rSaude: number | null
    rAmbiente: number | null
    rHidro: number | null
    rAr: number | null
    coverage: number | null
    dominantDomain: string | null
    updatedAt: string | null
  } | null
  climate: Array<{
    observed_at: string
    temperature: number | null
    humidity: number | null
    precipitation: number | null
  }>
  fires: Array<{
    acq_date: string
    latitude: number | null
    longitude: number | null
    brightness: number | null
  }>
  dengue: Array<{
    year: number
    epidemiological_week: number
    alert_level: number | null
    cases: number | null
  }>
  airQuality: Array<{
    city: string
    aqi: number | null
    dominant_pollutant: string | null
    observed_at: string
  }>
  cemaden: Array<{
    id: string
    alert_code: string
    severity: string
    alert_type: string
    description: string | null
    issued_at: string
  }>
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function useReconhecimento(ibge: string | null | undefined) {
  const enabled = Boolean(ibge)

  const [
    irtcQuery,
    climateQuery,
    firesQuery,
    dengueQuery,
    airQuery,
    cemadenQuery,
  ] = useQueries({
    queries: [
      {
        queryKey: ['reco-irtc', ibge],
        enabled,
        staleTime: 1000 * 60 * 15,
        queryFn: async () => {
          if (!ibge) return null
          const { data, error } = await supabase
            .from('irtc_scores')
            .select(
              'ibge_code, municipality, irtc_score, risk_level, risk_clima, ' +
                'risk_saude, risk_ambiente, risk_hidro, risk_ar, data_coverage, ' +
                'dominant_domain, calculated_at'
            )
            .eq('ibge_code', ibge)
            .limit(1)
            .maybeSingle()
          if (error) throw error
          if (!data) return null
          const row = data as Record<string, unknown>
          return {
            score: (row.irtc_score as number | null) ?? null,
            level: (row.risk_level as string | null) ?? null,
            rClima: (row.risk_clima as number | null) ?? null,
            rSaude: (row.risk_saude as number | null) ?? null,
            rAmbiente: (row.risk_ambiente as number | null) ?? null,
            rHidro: (row.risk_hidro as number | null) ?? null,
            rAr: (row.risk_ar as number | null) ?? null,
            coverage: (row.data_coverage as number | null) ?? null,
            dominantDomain: (row.dominant_domain as string | null) ?? null,
            updatedAt: (row.calculated_at as string | null) ?? null,
          }
        },
      },
      {
        queryKey: ['reco-climate', ibge],
        enabled,
        staleTime: 1000 * 60 * 15,
        queryFn: async () => {
          if (!ibge) return []
          const { data, error } = await supabase
            .from('climate_data')
            .select('observed_at, temperature, humidity, precipitation')
            .eq('ibge_code', ibge)
            .gte('observed_at', sinceIso(3))
            .order('observed_at', { ascending: false })
            .limit(72)
          if (error) throw error
          return (data ?? []) as ReconhecimentoSnapshot['climate']
        },
      },
      {
        queryKey: ['reco-fires', ibge],
        enabled,
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
          if (!ibge) return []
          const since = new Date(Date.now() - SEVEN_DAYS).toISOString().slice(0, 10)
          const { data, error } = await supabase
            .from('fire_spots')
            .select('acq_date, latitude, longitude, brightness, municipality')
            .gte('acq_date', since)
            .order('acq_date', { ascending: false })
            .limit(200)
          if (error) throw error
          return ((data ?? []) as ReconhecimentoSnapshot['fires'])
        },
      },
      {
        queryKey: ['reco-dengue', ibge],
        enabled,
        staleTime: 1000 * 60 * 60,
        queryFn: async () => {
          if (!ibge) return []
          const { data, error } = await supabase
            .from('dengue_data')
            .select('year, epidemiological_week, alert_level, cases')
            .eq('ibge_code', ibge)
            .order('year', { ascending: false })
            .order('epidemiological_week', { ascending: false })
            .limit(8)
          if (error) throw error
          return (data ?? []) as ReconhecimentoSnapshot['dengue']
        },
      },
      {
        queryKey: ['reco-air', ibge],
        enabled,
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
          if (!ibge) return []
          const { data, error } = await supabase
            .from('air_quality')
            .select('city, aqi, dominant_pollutant, observed_at')
            .order('observed_at', { ascending: false })
            .limit(20)
          if (error) throw error
          return (data ?? []) as ReconhecimentoSnapshot['airQuality']
        },
      },
      {
        queryKey: ['reco-cemaden', ibge],
        enabled,
        staleTime: 1000 * 60 * 5,
        queryFn: async () => {
          if (!ibge) return []
          const now = new Date().toISOString()
          const { data, error } = await supabase
            .from('cemaden_alerts')
            .select(
              'id, alert_code, severity, alert_type, description, issued_at'
            )
            .eq('ibge_code', ibge)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .gte('issued_at', sinceIso(30))
            .order('issued_at', { ascending: false })
            .limit(10)
          if (error) throw error
          return (data ?? []) as ReconhecimentoSnapshot['cemaden']
        },
      },
    ],
  })

  const snapshot: ReconhecimentoSnapshot = {
    irtc: irtcQuery.data ?? null,
    climate: climateQuery.data ?? [],
    fires: firesQuery.data ?? [],
    dengue: dengueQuery.data ?? [],
    airQuality: airQuery.data ?? [],
    cemaden: cemadenQuery.data ?? [],
  }

  const isLoading =
    irtcQuery.isLoading ||
    climateQuery.isLoading ||
    firesQuery.isLoading ||
    dengueQuery.isLoading ||
    airQuery.isLoading ||
    cemadenQuery.isLoading

  const isError =
    irtcQuery.isError ||
    climateQuery.isError ||
    firesQuery.isError ||
    dengueQuery.isError ||
    airQuery.isError ||
    cemadenQuery.isError

  return { snapshot, isLoading, isError }
}
