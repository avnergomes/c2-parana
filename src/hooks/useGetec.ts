// src/hooks/useGetec.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GetecKpis, GetecMunicipio } from '@/types/getec'

interface DataCacheRow {
  cache_key: string
  source: string | null
  data: unknown
  fetched_at: string
}

export function useGetecKpis() {
  return useQuery({
    queryKey: ['getec-kpis'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_kpis_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data as GetecKpis) || null
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}

export function useGetecMunicipios() {
  return useQuery({
    queryKey: ['getec-municipios'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_municipios_pr')
        .single() as { data: DataCacheRow | null }
      const cached = data?.data as { items?: GetecMunicipio[] } | GetecMunicipio[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}

interface AtendimentoRecord {
  municipio_code: number
  municipio: string
  atendimentos_dia: number
  atendimentos_total: number
  produtores_atendidos: number
  data: string
}

export interface AtendimentoMap {
  [municipio_code: number]: { dia: number; total: number; produtores: number }
}

export function useGetecAtendimentos() {
  return useQuery({
    queryKey: ['getec-atendimentos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_atendimentos_pr')
        .single() as { data: DataCacheRow | null }
      const cached = data?.data as { items?: AtendimentoRecord[] } | AtendimentoRecord[] | null
      const items = Array.isArray(cached) ? cached : (cached?.items || [])
      const map: AtendimentoMap = {}
      for (const item of items) {
        map[item.municipio_code] = {
          dia: item.atendimentos_dia,
          total: item.atendimentos_total,
          produtores: item.produtores_atendidos,
        }
      }
      return map
    },
    staleTime: 1000 * 60 * 60 * 6, // 6h
  })
}
