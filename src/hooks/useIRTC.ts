// src/hooks/useIRTC.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface IRTCResult {
  ibgeCode: string
  municipality: string
  irtc: number
  rClima: number
  rSaude: number
  rAmbiente: number
  rHidro: number
  rAr: number
  riskLevel: 'baixo' | 'médio' | 'alto' | 'crítico'
}

interface IRTCRawData {
  ibge_code: string
  municipality: string
  irtc_score: number
  risk_clima: number
  risk_saude: number
  risk_ambiente: number
  risk_hidro: number
  risk_ar: number
  risk_level: string
}

export function getIRTCColor(score: number): string {
  if (score <= 25) return '#10b981' // green
  if (score <= 50) return '#f59e0b' // yellow
  if (score <= 75) return '#f97316' // orange
  return '#ef4444' // red
}

export interface IRTCHookReturn {
  data: Map<string, IRTCResult> | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  summary: {
    average: number
    critical: number
    high: number
    medium: number
    low: number
  } | null
}

export function useIRTC(): IRTCHookReturn {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['irtc-data'],
    queryFn: async () => {
      const { data: rawData, error: queryError } = await supabase
        .from('irtc_scores')
        .select(
          'ibge_code, municipality, irtc_score, risk_clima, risk_saude, risk_ambiente, risk_hidro, risk_ar, risk_level'
        )
        .order('irtc_score', { ascending: false })

      if (queryError) {
        console.error('Error fetching IRTC data:', queryError)
        throw queryError
      }

      if (!rawData || rawData.length === 0) {
        return new Map<string, IRTCResult>()
      }

      const typedData = rawData as IRTCRawData[]
      const map = new Map<string, IRTCResult>()

      for (const row of typedData) {
        const result: IRTCResult = {
          ibgeCode: row.ibge_code,
          municipality: row.municipality,
          irtc: row.irtc_score,
          rClima: row.risk_clima,
          rSaude: row.risk_saude,
          rAmbiente: row.risk_ambiente,
          rHidro: row.risk_hidro,
          rAr: row.risk_ar,
          riskLevel: (
            row.risk_level?.toLowerCase() as 'baixo' | 'médio' | 'alto' | 'crítico' | undefined
          ) || 'baixo',
        }
        map.set(row.ibge_code, result)
      }

      return map
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchInterval: 1000 * 60 * 60, // 1 hour
    retry: 2,
  })

  // Calculate summary stats
  const summary = data
    ? {
        average: Array.from(data.values()).reduce((sum, r) => sum + r.irtc, 0) / data.size,
        critical: Array.from(data.values()).filter((r) => r.irtc >= 75).length,
        high: Array.from(data.values()).filter((r) => r.irtc >= 50 && r.irtc < 75).length,
        medium: Array.from(data.values()).filter((r) => r.irtc >= 25 && r.irtc < 50).length,
        low: Array.from(data.values()).filter((r) => r.irtc < 25).length,
      }
    : null

  return {
    data: data || null,
    isLoading,
    isError,
    error: error as Error | null,
    summary,
  }
}
