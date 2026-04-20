// src/hooks/useEtlHealth.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EtlHealthRecord {
  cache_key: string
  data: {
    last_run: string
    status: string
    duration_seconds: number
    errors: string[]
    [key: string]: unknown
  }
  fetched_at: string
}

const ETL_HEALTH_KEYS = [
  'etl_health_clima',
  'etl_health_saude',
  'etl_health_ambiente',
  'etl_health_agro',
  'etl_health_legislativo',
  'etl_health_agua',
] as const

const ETL_DISPLAY_NAMES: Record<string, string> = {
  etl_health_clima: 'Clima (INMET/Open-Meteo)',
  etl_health_saude: 'Saúde (InfoDengue)',
  etl_health_ambiente: 'Ambiente (FIRMS/AQICN/ANA)',
  etl_health_agro: 'Agronegócio (SIDRA/ComexStat)',
  etl_health_legislativo: 'Legislativo (ALEP)',
  etl_health_agua: 'Água (InfoHidro/SAR)',
}

// Janela aceitavel ate considerar a ultima execucao "stale", em horas.
// Calibrada pelo cron de cada ETL com 1.5x de folga para tolerar atrasos do
// scheduler do GitHub Actions e finais de semana sem execucao agendada.
export const ETL_FRESHNESS_HOURS: Record<string, number> = {
  etl_health_clima: 3,           // cron horario
  etl_health_ambiente: 18,       // cron 12h
  etl_health_agua: 9,            // cron 6h
  etl_health_legislativo: 96,    // cron dias uteis -> ate 72h no fim de semana
  etl_health_saude: 84,          // cron seg/qua/sex -> ate 72h
  etl_health_agro: 192,          // cron semanal (segundas) -> 8 dias
}
export const ETL_FRESHNESS_DEFAULT_HOURS = 25

export function useEtlHealth() {
  return useQuery({
    queryKey: ['etl-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_cache')
        .select('cache_key, data, fetched_at')
        .in('cache_key', ETL_HEALTH_KEYS as unknown as string[])

      if (error) throw error

      return (data || []).map((record: EtlHealthRecord) => ({
        ...record,
        displayName: ETL_DISPLAY_NAMES[record.cache_key] || record.cache_key,
      }))
    },
    staleTime: 5 * 60 * 1000, // 5 min
    refetchInterval: 5 * 60 * 1000,
  })
}
