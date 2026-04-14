// src/hooks/useCommandDashboard.ts
// Aggregates KPIs for the Commander dashboard (Fase 4.F)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Incident, Severity } from '@/types/incident'

export interface CommandKPIs {
  activeIncidents: number
  activeBySeverity: Record<Severity, number>
  avgResponseMinutes: number | null
  slaCompliancePct: number | null
  highRiskMunis: number
  resolvedLast24h: number
}

export interface UrgentIncident extends Incident {
  ageMinutes: number
}

const SLA_MINUTES: Record<Severity, number> = {
  critical: 15,
  high: 60,
  medium: 240,
  low: 1440,
}

export function useCommandDashboard() {
  return useQuery<CommandKPIs>({
    queryKey: ['command-dashboard'],
    queryFn: async () => {
      // Fetch incidents (active + recently resolved) in parallel with IRTC summary
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [incidentsRes, irtcRes] = await Promise.all([
        (supabase as any)
          .from('incidents')
          .select('severity, status, detected_at, acknowledged_at, resolved_at')
          .or(`status.not.in.(resolved,closed),resolved_at.gte.${since24h}`),
        (supabase as any)
          .from('irtc_scores')
          .select('ibge_code, irtc_score'),
      ])

      const incidents = (incidentsRes.data || []) as Array<{
        severity: Severity
        status: string
        detected_at: string
        acknowledged_at: string | null
        resolved_at: string | null
      }>

      const irtcs = (irtcRes.data || []) as Array<{ irtc_score: number }>

      // Active incidents + severity breakdown
      const active = incidents.filter((i) => !['resolved', 'closed'].includes(i.status))
      const activeBySeverity: Record<Severity, number> = {
        critical: 0, high: 0, medium: 0, low: 0,
      }
      for (const i of active) {
        activeBySeverity[i.severity] = (activeBySeverity[i.severity] || 0) + 1
      }

      // Avg response time (minutes between detected_at and acknowledged_at)
      // for incidents acknowledged in the last 24h
      const acknowledged = incidents.filter(
        (i) => i.acknowledged_at &&
          new Date(i.acknowledged_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
      )
      const avgResponseMinutes = acknowledged.length > 0
        ? acknowledged.reduce((sum, i) => {
            const diff = new Date(i.acknowledged_at!).getTime() - new Date(i.detected_at).getTime()
            return sum + diff / 60000
          }, 0) / acknowledged.length
        : null

      // SLA compliance: % of incidents acknowledged within SLA
      const slaCompliancePct = acknowledged.length > 0
        ? (acknowledged.filter((i) => {
            const responseMin = (new Date(i.acknowledged_at!).getTime() - new Date(i.detected_at).getTime()) / 60000
            return responseMin <= SLA_MINUTES[i.severity]
          }).length / acknowledged.length) * 100
        : null

      // High-risk municipalities (IRTC > 60)
      const highRiskMunis = irtcs.filter((r) => r.irtc_score > 60).length

      // Resolved in last 24h
      const resolvedLast24h = incidents.filter(
        (i) => i.resolved_at && new Date(i.resolved_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
      ).length

      return {
        activeIncidents: active.length,
        activeBySeverity,
        avgResponseMinutes,
        slaCompliancePct,
        highRiskMunis,
        resolvedLast24h,
      }
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

export function useUrgentIncidents(limit = 5) {
  return useQuery<UrgentIncident[]>({
    queryKey: ['urgent-incidents', limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('incidents')
        .select('*')
        .not('status', 'in', '(resolved,closed)')
        .is('acknowledged_at', null)
        .order('severity', { ascending: true })
        .order('detected_at', { ascending: true })
        .limit(limit * 2)

      if (error) throw error

      const items = (data || []) as Incident[]
      // Sort by severity rank + age (older first within same severity)
      const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      items.sort((a, b) => {
        const r = rank[a.severity] - rank[b.severity]
        if (r !== 0) return r
        return new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
      })

      return items.slice(0, limit).map((i) => ({
        ...i,
        ageMinutes: Math.floor((Date.now() - new Date(i.detected_at).getTime()) / 60000),
      }))
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

export function useIncidentMetrics(days = 30) {
  return useQuery({
    queryKey: ['incident-metrics', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await (supabase as any)
        .from('incidents')
        .select('type, severity, detected_at, resolved_at')
        .gte('detected_at', since)

      if (error) throw error

      const items = (data || []) as Array<{
        type: string
        severity: Severity
        detected_at: string
        resolved_at: string | null
      }>

      // Count by type
      const byType: Record<string, number> = {}
      for (const i of items) {
        byType[i.type] = (byType[i.type] || 0) + 1
      }

      // Avg resolution time by severity (only resolved)
      const resTimeBySeverity: Record<Severity, number[]> = {
        critical: [], high: [], medium: [], low: [],
      }
      for (const i of items) {
        if (i.resolved_at) {
          const hours = (new Date(i.resolved_at).getTime() - new Date(i.detected_at).getTime()) / 3600000
          resTimeBySeverity[i.severity].push(hours)
        }
      }

      const avgResolutionHours: Record<Severity, number> = {
        critical: 0, high: 0, medium: 0, low: 0,
      }
      for (const sev of Object.keys(resTimeBySeverity) as Severity[]) {
        const arr = resTimeBySeverity[sev]
        avgResolutionHours[sev] = arr.length > 0
          ? arr.reduce((a, b) => a + b, 0) / arr.length
          : 0
      }

      return {
        byType,
        avgResolutionHours,
        total: items.length,
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
