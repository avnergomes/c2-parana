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

export interface ExtensaoMunicipio {
  municipio_code: number
  municipio: string
  extensionistas: number
  nomes: string[]
}

export interface ExtensaoData {
  kpis: {
    total_extensionistas: number
    municipios_com_extensionista: number
    municipios_sem_extensionista: number
    media_por_municipio: number
    total_projetos: number
    total_acoes: number
    data_referencia: string
  }
  extensionistas_por_municipio: ExtensaoMunicipio[]
  projetos: { codigo: string; nome: string; detalhes?: string }[]
  acoes: { codigo: string; nome: string }[]
}

export function useGetecExtensao() {
  return useQuery({
    queryKey: ['getec-extensao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_extensao_pr')
        .maybeSingle() as { data: DataCacheRow | null }
      return (data?.data as ExtensaoData) || null
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}

export interface TimelinePoint {
  date: string
  produtores: number
}

export function useGetecTimeline() {
  return useQuery({
    queryKey: ['getec-timeline'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_timeline_pr')
        .maybeSingle() as { data: DataCacheRow | null }
      const cached = data?.data as { items?: TimelinePoint[] } | TimelinePoint[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

/** Daily attendance per municipality: { "YYYY-MM-DD": { "mun_code": count } } */
export type DailyAtendimentosMap = Record<string, Record<string, number>>

export function useGetecAtendimentosDaily() {
  return useQuery({
    queryKey: ['getec-atendimentos-daily'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'getec_atendimentos_daily_pr')
        .maybeSingle() as { data: DataCacheRow | null }
      return (data?.data as DailyAtendimentosMap) || null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
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
