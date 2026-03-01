// src/hooks/useAgro.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
      return data?.data || []
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
      return data?.data as {
        vbp_total_brl: number
        vbp_lavoura_brl: number
        vbp_pecuaria_brl: number
        variacao_yoy: number
        ano_referencia: number
      } | null
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
      return data?.data as {
        exportacoes_usd: number
        importacoes_usd: number
        saldo_usd: number
        variacao_export_yoy: number
        mes_referencia: string
      } | null
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
      return data?.data as {
        estoque_atual: number
        saldo_mes: number
        variacao_yoy: number
        serie: Array<{ ano_mes: string; saldo: number; estoque: number }>
      } | null
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
      return data?.data as {
        total_ano_brl: number
        num_contratos: number
        variacao_yoy: number
        serie: Array<{ ano_mes: string; valor: number }>
      } | null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}
