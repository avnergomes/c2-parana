// src/hooks/useClima.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EstacaoClima, AlertaINMET } from '@/types/clima'

interface HistoricoData {
  temperature: number | null
  humidity: number | null
  precipitation: number | null
  observed_at: string
}

export function useEstacoesPR() {
  return useQuery({
    queryKey: ['clima-estacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('climate_data')
        .select('*')
        .order('observed_at', { ascending: false })

      if (error) throw error

      // Deduplicate: última leitura por estação
      const seen = new Set<string>()
      const unique: EstacaoClima[] = []
      for (const row of (data || []) as EstacaoClima[]) {
        if (!seen.has(row.station_code)) {
          seen.add(row.station_code)
          unique.push(row)
        }
      }
      return unique
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
  })
}

export function useEstacaoCuritiba() {
  return useQuery({
    queryKey: ['clima-curitiba'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('climate_data')
        .select('*')
        .eq('station_code', 'A807')
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        console.warn('Erro ao buscar clima Curitiba:', error.message)
        return null
      }
      return data as EstacaoClima | null
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
    retry: 2,
  })
}

export function useAlertasINMET() {
  return useQuery({
    queryKey: ['alertas-inmet'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('source', 'inmet')
        .eq('is_active', true)
        .order('starts_at', { ascending: false })
      if (error) throw error
      return (data || []) as AlertaINMET[]
    },
    staleTime: 1000 * 60 * 15,
    refetchInterval: 1000 * 60 * 30,
  })
}

export function useHistoricoClima(stationCode: string, days = 7) {
  return useQuery({
    queryKey: ['clima-historico', stationCode, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, humidity, precipitation, observed_at')
        .eq('station_code', stationCode)
        .gte('observed_at', since)
        .order('observed_at', { ascending: true })
      return (data || []) as HistoricoData[]
    },
    staleTime: 1000 * 60 * 30,
  })
}
