// src/hooks/useSaude.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import type { DengueData, SaudeKpis } from '@/types/saude'

type DengueDataRow = Database['public']['Tables']['dengue_data']['Row']
type DataCacheRow = Database['public']['Tables']['data_cache']['Row']

export function useDengueAtual() {
  return useQuery({
    queryKey: ['dengue-atual'],
    queryFn: async () => {
      // Buscar última semana epidemiológica disponível
      const { data: latest } = await supabase
        .from('dengue_data')
        .select('year, epidemiological_week')
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: Pick<DengueDataRow, 'year' | 'epidemiological_week'> | null }

      if (!latest) return []

      const { data } = await supabase
        .from('dengue_data')
        .select('*')
        .eq('year', latest.year)
        .eq('epidemiological_week', latest.epidemiological_week)
        .order('cases', { ascending: false }) as { data: DengueDataRow[] | null }

      return (data || []) as DengueData[]
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useDengueSerie(ibgeCode?: string, semanas = 12) {
  return useQuery({
    queryKey: ['dengue-serie', ibgeCode, semanas],
    queryFn: async () => {
      let query = supabase
        .from('dengue_data')
        .select('ibge_code, municipality_name, epidemiological_week, year, cases, alert_level')
        .order('year', { ascending: true })
        .order('epidemiological_week', { ascending: true })

      if (ibgeCode) {
        // Com filtro por município: limitar pelas semanas solicitadas
        query = query.eq('ibge_code', ibgeCode).limit(semanas)
      } else {
        // Sem filtro: limitar a 1000 rows para respeitar o default do Supabase
        // e evitar queries muito grandes
        query = query.limit(1000)
      }

      const { data } = await query as { data: Pick<DengueDataRow, 'ibge_code' | 'municipality_name' | 'epidemiological_week' | 'year' | 'cases' | 'alert_level'>[] | null }
      return data || []
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useSaudeKpis() {
  return useQuery({
    queryKey: ['saude-kpis'],
    queryFn: async () => {
      // Calcular KPIs dos dados de dengue mais recentes
      const { data: latest } = await supabase
        .from('dengue_data')
        .select('year, epidemiological_week')
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: Pick<DengueDataRow, 'year' | 'epidemiological_week'> | null }

      if (!latest) return null

      const { data: current } = await supabase
        .from('dengue_data')
        .select('cases, alert_level')
        .eq('year', latest.year)
        .eq('epidemiological_week', latest.epidemiological_week) as { data: Pick<DengueDataRow, 'cases' | 'alert_level'>[] | null }

      const prevWeek = latest.epidemiological_week > 1
        ? latest.epidemiological_week - 1
        : 52

      const { data: previous } = await supabase
        .from('dengue_data')
        .select('cases')
        .eq('year', latest.epidemiological_week > 1 ? latest.year : latest.year - 1)
        .eq('epidemiological_week', prevWeek) as { data: Pick<DengueDataRow, 'cases'>[] | null }

      const totalCasos = current?.reduce((s, d) => s + (d.cases || 0), 0) || 0
      const totalCasosAnterior = previous?.reduce((s, d) => s + (d.cases || 0), 0) || 0
      const municipiosAlerta = current?.filter(d => (d.alert_level || 0) >= 1).length || 0
      const municipiosEpidemia = current?.filter(d => (d.alert_level || 0) >= 3).length || 0
      const variacaoSemana = totalCasosAnterior > 0
        ? ((totalCasos - totalCasosAnterior) / totalCasosAnterior) * 100
        : 0

      // Buscar KPIs de leitos do data_cache
      const { data: leitosCached } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'leitos_sus_pr')
        .maybeSingle() as { data: Pick<DataCacheRow, 'data'> | null }

      return {
        total_casos_semana: totalCasos,
        municipios_alerta: municipiosAlerta,
        municipios_epidemia: municipiosEpidemia,
        semana_epidemiologica: latest.epidemiological_week,
        variacao_semana: variacaoSemana,
        total_leitos_sus: (leitosCached?.data as { total_leitos?: number })?.total_leitos || null,
      } as SaudeKpis
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useLeitosSUS() {
  return useQuery({
    queryKey: ['leitos-sus'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'leitos_sus_pr')
        .maybeSingle() as { data: Pick<DataCacheRow, 'data' | 'fetched_at'> | null }
      return data?.data as {
        total_leitos: number
        leitos_uti: number
        ocupacao_uti_pct?: number
        data_referencia: string
      } | null
    },
    staleTime: 1000 * 60 * 60 * 24,
  })
}
