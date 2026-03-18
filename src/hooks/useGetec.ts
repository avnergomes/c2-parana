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
