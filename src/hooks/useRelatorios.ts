// src/hooks/useRelatorios.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SituationalReport {
  id: string
  report_date: string
  executive_summary: string
  active_alerts_count: number
  top_risks: {
    municipality: string
    ibge_code: string
    irtc_score: number
    risk_level: string
    dominant_domain: string
    data_coverage: number
  }[]
  domain_summaries: {
    dengue?: { week: string; total_cases: number; municipios_alerta: number; municipios_total?: number }
    clima?: { stations: number; avg_temp: number | null; max_temp: number | null; avg_humidity: number | null }
    incendios?: { total_spots: number; affected_municipalities: number }
    rios?: { total_stations: number; by_level: Record<string, number> }
    irtc_distribuicao?: Record<string, number>
    alertas?: { total_24h: number; por_severidade: Record<string, number> }
  }
  recommendations: string
  generated_at: string
}

export function useRelatorios(limit = 30) {
  return useQuery({
    queryKey: ['relatorios-situacionais', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('situational_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data || []) as SituationalReport[]
    },
    staleTime: 1000 * 60 * 30, // 30 min
  })
}

export function useLatestRelatorio() {
  return useQuery({
    queryKey: ['relatorio-latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('situational_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as SituationalReport | null
    },
    staleTime: 1000 * 60 * 30,
  })
}
