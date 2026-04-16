// src/hooks/useDatasusSih.ts
// Fase 5.F — consulta datasus_sih (internações hospitalares)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SihRecord {
  id: string
  ibge_code: string
  competencia: string
  cid_chapter: number | null
  cid_chapter_label: string | null
  internacoes: number
  obitos: number
  valor_total_reais: number | null
  dias_permanencia: number | null
  ingested_at: string
}

interface SihQueryOptions {
  ibge?: string | null
  months?: number
  cidChapter?: number | null
}

export function useDatasusSih({
  ibge,
  months = 12,
  cidChapter,
}: SihQueryOptions = {}) {
  return useQuery({
    queryKey: ['datasus-sih', { ibge, months, cidChapter }],
    queryFn: async () => {
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - months)
      cutoff.setDate(1)

      let query = supabase
        .from('datasus_sih')
        .select(
          'id, ibge_code, competencia, cid_chapter, cid_chapter_label, ' +
            'internacoes, obitos, valor_total_reais, dias_permanencia, ingested_at'
        )
        .gte('competencia', cutoff.toISOString().slice(0, 10))
        .order('competencia', { ascending: true })
        .limit(5000)

      if (ibge) query = query.eq('ibge_code', ibge)
      if (cidChapter != null) query = query.eq('cid_chapter', cidChapter)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as SihRecord[]
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useDatasusSihIngestionStatus() {
  return useQuery({
    queryKey: ['datasus-sih-ingestion-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datasus_sih_ingestion_log')
        .select('competencia, rows_inserted, status, error_message, finished_at')
        .order('competencia', { ascending: false })
        .limit(12)
      if (error) throw error
      return (data ?? []) as Array<{
        competencia: string
        rows_inserted: number
        status: string
        error_message: string | null
        finished_at: string | null
      }>
    },
    staleTime: 1000 * 60 * 60,
  })
}
