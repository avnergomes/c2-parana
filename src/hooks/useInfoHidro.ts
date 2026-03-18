// src/hooks/useInfoHidro.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ReservatorioData,
  EstacaoTelemetria,
  DisponibilidadeHidrica,
} from '@/types/infohidro'
import type { Manancial, ManancialKpis } from '@/types/manancial'

// Type for data_cache table results
interface DataCacheRow {
  cache_key: string
  source: string | null
  data: unknown
  fetched_at: string
}

export function useReservatorios() {
  return useQuery({
    queryKey: ['infohidro-reservatorios'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'infohidro_reservatorios_pr')
        .single() as { data: DataCacheRow | null }

      const cached = data?.data as { items?: ReservatorioData[] } | ReservatorioData[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 30, // 30 min — reservoirs update every 6h
  })
}

export function useEstacoesTelemetria() {
  return useQuery({
    queryKey: ['infohidro-estacoes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'infohidro_estacoes_pr')
        .single() as { data: DataCacheRow | null }

      const cached = data?.data as { items?: EstacaoTelemetria[] } | EstacaoTelemetria[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h — stations rarely change
  })
}

export function useDisponibilidadeHidrica() {
  return useQuery({
    queryKey: ['infohidro-disponibilidade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'infohidro_disponibilidade_hidrica')
        .single() as { data: DataCacheRow | null }

      const cached = data?.data as { items?: DisponibilidadeHidrica[] } | DisponibilidadeHidrica[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 60 * 6, // 6h
  })
}

export function useReservatorioKpis() {
  const { data: reservatorios, isLoading } = useReservatorios()

  if (isLoading || !reservatorios?.length) {
    return { data: null, isLoading }
  }

  const volumeMedio = reservatorios.reduce((s, r) => s + r.volume_percent, 0) / reservatorios.length
  const emAlerta = reservatorios.filter(r => r.volume_percent < 50).length
  const totalVolume = reservatorios.reduce((s, r) => s + r.volume_hm3, 0)

  return {
    data: {
      volume_medio_percent: Math.round(volumeMedio * 10) / 10,
      reservatorios_em_alerta: emAlerta,
      total_reservatorios: reservatorios.length,
      volume_total_hm3: Math.round(totalVolume * 100) / 100,
    },
    isLoading,
  }
}

export function useMananciais() {
  return useQuery({
    queryKey: ['infohidro-mananciais'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'infohidro_mananciais_pr')
        .single() as { data: DataCacheRow | null }

      const cached = data?.data as { items?: Manancial[] } | Manancial[] | null
      return Array.isArray(cached) ? cached : (cached?.items || [])
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useManancialKpis(): { data: ManancialKpis | null; isLoading: boolean } {
  const { data: mananciais, isLoading } = useMananciais()

  const kpis = useMemo(() => {
    if (!mananciais?.length) return null

    const emAlerta = mananciais.filter(m => m.alerta).length
    const municipios = new Set(mananciais.map(m => m.municipio)).size

    const dispCounts: Record<string, number> = {}
    for (const m of mananciais) {
      const d = m.disponibilidade ?? 'desconhecido'
      dispCounts[d] = (dispCounts[d] || 0) + 1
    }
    const dispMedia = Object.entries(dispCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/D'

    return {
      total_mananciais: mananciais.length,
      em_alerta: emAlerta,
      disponibilidade_media: dispMedia,
      municipios_monitorados: municipios,
      data_referencia: mananciais[0]?.ultima_atualizacao ?? '',
    }
  }, [mananciais])

  return { data: kpis, isLoading }
}
