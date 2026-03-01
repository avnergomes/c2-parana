// src/hooks/useAgro.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  VbpKpis,
  VbpMunicipio,
  ComexKpis,
  EmpregoAgroKpis,
  CreditoRuralKpis,
} from '@/types/agro'

const PRECOS_API = import.meta.env.VITE_PRECOS_API_URL || 'https://sima-precos.onrender.com'

// Type for data_cache table results
interface DataCacheRow {
  cache_key: string
  source: string | null
  data: unknown
  fetched_at: string
}

export function usePrecosDiarios(produto?: string) {
  return useQuery({
    queryKey: ['precos-diarios', produto],
    queryFn: async () => {
      const url = produto
        ? `${PRECOS_API}/precos?produto=${encodeURIComponent(produto)}&limit=30`
        : `${PRECOS_API}/precos?limit=50`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Falha ao buscar preços SIMA')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useVbpMunicipios() {
  return useQuery({
    queryKey: ['vbp-municipios'],
    queryFn: async () => {
      // Buscar JSON processado do data_cache
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'vbp_municipios_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data || []) as VbpMunicipio[]
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}

export function useVbpKpis() {
  return useQuery({
    queryKey: ['vbp-kpis'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'vbp_kpis_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data as VbpKpis) || null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useComexKpis() {
  return useQuery({
    queryKey: ['comex-kpis'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'comex_kpis_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data as ComexKpis) || null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useEmpregoAgro() {
  return useQuery({
    queryKey: ['emprego-agro'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'emprego_agro_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data as EmpregoAgroKpis) || null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useCreditoRural() {
  return useQuery({
    queryKey: ['credito-rural'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'credito_rural_pr')
        .single() as { data: DataCacheRow | null }
      return (data?.data as CreditoRuralKpis) || null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}
