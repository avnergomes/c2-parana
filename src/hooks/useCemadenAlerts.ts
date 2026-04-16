// src/hooks/useCemadenAlerts.ts
// Fase 5.A — consulta cemaden_alerts do Supabase
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type CemadenSeverity = 'observacao' | 'atencao' | 'alerta' | 'alerta_maximo'

export type CemadenAlertType =
  | 'geologico'
  | 'hidrologico'
  | 'meteorologico'
  | 'movimento_massa'
  | 'alagamento'
  | 'inundacao'
  | 'enxurrada'
  | 'erosao'
  | 'outro'

export interface CemadenAlert {
  id: string
  alert_code: string
  uf: string
  municipality: string
  ibge_code: string | null
  alert_type: CemadenAlertType
  severity: CemadenSeverity
  description: string | null
  affected_area_km2: number | null
  geometry_geojson: Record<string, unknown> | null
  issued_at: string
  expires_at: string | null
  source_url: string | null
  ingested_at: string
}

const SEVERITY_RANK: Record<CemadenSeverity, number> = {
  observacao: 1,
  atencao: 2,
  alerta: 3,
  alerta_maximo: 4,
}

export function compareSeverity(a: CemadenSeverity, b: CemadenSeverity): number {
  return SEVERITY_RANK[b] - SEVERITY_RANK[a]
}

interface UseCemadenAlertsOptions {
  days?: number
  minSeverity?: CemadenSeverity
  ibge?: string | null
  onlyActive?: boolean
  limit?: number
}

export function useCemadenAlerts(opts: UseCemadenAlertsOptions = {}) {
  const { days = 7, minSeverity, ibge, onlyActive = false, limit = 100 } = opts

  return useQuery({
    queryKey: ['cemaden-alerts', { days, minSeverity, ibge, onlyActive, limit }],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      let query = supabase
        .from('cemaden_alerts')
        .select(
          'id, alert_code, uf, municipality, ibge_code, alert_type, severity, ' +
            'description, affected_area_km2, geometry_geojson, issued_at, ' +
            'expires_at, source_url, ingested_at'
        )
        .gte('issued_at', since)
        .order('issued_at', { ascending: false })
        .limit(limit)

      if (ibge) {
        query = query.eq('ibge_code', ibge)
      }

      if (onlyActive) {
        query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      }

      const { data, error } = await query
      if (error) throw error

      const rows = (data ?? []) as CemadenAlert[]
      if (!minSeverity) return rows
      return rows.filter(
        (row) => SEVERITY_RANK[row.severity] >= SEVERITY_RANK[minSeverity]
      )
    },
    staleTime: 1000 * 60 * 2, // feed atualiza a cada ~10 min no CEMADEN
    refetchInterval: 1000 * 60 * 5,
  })
}

export function useCemadenActiveCountBySeverity(ibge?: string | null) {
  return useQuery({
    queryKey: ['cemaden-active-count', ibge ?? 'all'],
    queryFn: async () => {
      const now = new Date().toISOString()
      let query = supabase
        .from('cemaden_alerts')
        .select('severity', { count: 'exact' })
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .gte('issued_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      if (ibge) {
        query = query.eq('ibge_code', ibge)
      }

      const { data, error } = await query
      if (error) throw error

      const counts: Record<CemadenSeverity, number> = {
        observacao: 0,
        atencao: 0,
        alerta: 0,
        alerta_maximo: 0,
      }
      const rows = (data ?? []) as Array<{ severity: CemadenSeverity }>
      for (const row of rows) {
        if (row.severity in counts) counts[row.severity] += 1
      }
      return counts
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 5,
  })
}
