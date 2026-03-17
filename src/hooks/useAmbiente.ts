// src/hooks/useAmbiente.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import type { FireSpot, RiverLevel, AirQualityData } from '@/types/ambiente'

type FireSpotRow = Database['public']['Tables']['fire_spots']['Row']
type RiverLevelRow = Database['public']['Tables']['river_levels']['Row']
type AirQualityRow = Database['public']['Tables']['air_quality']['Row']

export function useFireSpots(days = 7) {
  return useQuery({
    queryKey: ['fire-spots', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('fire_spots')
        .select('*')
        .gte('acq_date', since)
        .order('acq_date', { ascending: false })
        .limit(3000) as { data: FireSpotRow[] | null; error: unknown }
      if (error) throw error
      return (data || []) as FireSpot[]
    },
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}

export function useFireTrend(days = 30) {
  return useQuery({
    queryKey: ['fire-trend', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('acq_date')
        .gte('acq_date', since)
        .order('acq_date', { ascending: true }) as { data: Pick<FireSpotRow, 'acq_date'>[] | null }

      // Agrupar por dia
      const byDay = (data || []).reduce((acc, spot) => {
        const day = spot.acq_date
        acc[day] = (acc[day] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      return Object.entries(byDay).map(([date, count]) => ({ date, count }))
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useRiverLevels() {
  return useQuery({
    queryKey: ['river-levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('river_levels')
        .select('*')
        .order('observed_at', { ascending: false }) as { data: RiverLevelRow[] | null; error: unknown }

      if (error) throw error

      // Deduplicate: última leitura por estação
      const seen = new Set<string>()
      return (data || []).filter(r => {
        if (seen.has(r.station_code)) return false
        seen.add(r.station_code)
        return true
      }) as RiverLevel[]
    },
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}

export function useAirQuality() {
  return useQuery({
    queryKey: ['air-quality'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('air_quality')
        .select('*')
        .order('observed_at', { ascending: false }) as { data: AirQualityRow[] | null; error: unknown }

      if (error) throw error

      // Deduplicate: última por cidade
      const seen = new Set<string>()
      return (data || []).filter(r => {
        if (seen.has(r.city)) return false
        seen.add(r.city)
        return true
      }) as AirQualityData[]
    },
    staleTime: 1000 * 60 * 60,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}
