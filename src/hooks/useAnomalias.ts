// src/hooks/useAnomalias.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Anomalia {
  id: string
  domain: string
  indicator: string
  station_code: string
  municipality: string
  observed_value: number
  z_score: number
  window_mean: number
  window_stddev: number
  window_size: number
  detected_at: string
}

export function useAnomalias(days = 7) {
  return useQuery({
    queryKey: ['anomalias', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('anomalies')
        .select('*')
        .gte('detected_at', since)
        .order('detected_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data || []) as Anomalia[]
    },
    staleTime: 1000 * 60 * 30,
  })
}
