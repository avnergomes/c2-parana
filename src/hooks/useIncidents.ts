// src/hooks/useIncidents.ts
// Lista, filtra e pagina incidentes (Fase 4.B)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Incident, IncidentStatus, IncidentType, Severity } from '@/types/incident'

export interface IncidentFilters {
  status?: IncidentStatus | IncidentStatus[]
  type?: IncidentType
  severity?: Severity
  assignedTo?: string
}

export function useIncidents(
  page = 0,
  pageSize = 20,
  filters?: IncidentFilters,
) {
  return useQuery({
    queryKey: ['incidents', page, pageSize, filters],
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = (supabase as any)
        .from('incidents')
        .select('*', { count: 'exact' })
        .order('detected_at', { ascending: false })
        .range(from, to)

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }
      if (filters?.type) {
        query = query.eq('type', filters.type)
      }
      if (filters?.severity) {
        query = query.eq('severity', filters.severity)
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { items: (data || []) as Incident[], total: count || 0 }
    },
    staleTime: 1000 * 30,
  })
}

export function useActiveIncidents() {
  return useIncidents(0, 100, {
    status: ['detected', 'observing', 'orienting', 'deciding', 'acting', 'monitoring'],
  })
}

export function useIncidentCounts() {
  return useQuery({
    queryKey: ['incidents-counts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('incidents')
        .select('status, severity')

      if (error) throw error
      const items = (data || []) as Array<{ status: string; severity: string }>

      const byStatus: Record<string, number> = {}
      const bySeverity: Record<string, number> = {}
      let active = 0

      for (const item of items) {
        byStatus[item.status] = (byStatus[item.status] || 0) + 1
        bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1
        if (!['resolved', 'closed'].includes(item.status)) {
          active++
        }
      }

      return { byStatus, bySeverity, active, total: items.length }
    },
    staleTime: 1000 * 60,
  })
}
