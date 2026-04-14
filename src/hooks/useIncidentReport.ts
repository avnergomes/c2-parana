// src/hooks/useIncidentReport.ts
// Generate and fetch post-incident reports (Fase 4.G)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Incident, IncidentAction, Playbook } from '@/types/incident'

export interface IncidentReport {
  id: string
  incident_id: string
  summary: {
    title: string
    type: string
    severity: string
    duration_hours: number
    municipalities: Array<{ ibge_code: string; name: string }>
    actions_count: number
  }
  timeline: Array<{
    action_type: string
    description: string
    performed_at: string
  }>
  metrics: {
    response_time_minutes: number | null
    resolution_time_hours: number | null
    playbook_steps_completed: number
    escalation_count: number
  }
  playbook_compliance: number | null
  lessons_learned: string | null
  context_snapshot: Record<string, unknown>
  generated_at: string
  finalized_by: string | null
  finalized_at: string | null
}

export function useIncidentReport(incidentId: string | undefined) {
  return useQuery<IncidentReport | null>({
    queryKey: ['incident-report', incidentId],
    queryFn: async () => {
      if (!incidentId) return null
      const { data, error } = await (supabase as any)
        .from('incident_reports')
        .select('*')
        .eq('incident_id', incidentId)
        .maybeSingle()

      if (error) throw error
      return (data as IncidentReport | null) || null
    },
    enabled: !!incidentId,
    staleTime: 1000 * 60,
  })
}

export function useGenerateIncidentReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      incident,
      actions,
      playbook,
    }: {
      incident: Incident
      actions: IncidentAction[]
      playbook: Playbook | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()

      // Compute metrics
      const detectedMs = new Date(incident.detected_at).getTime()
      const ackMs = incident.acknowledged_at
        ? new Date(incident.acknowledged_at).getTime()
        : null
      const resolvedMs = incident.resolved_at
        ? new Date(incident.resolved_at).getTime()
        : null
      const closedMs = incident.closed_at
        ? new Date(incident.closed_at).getTime()
        : Date.now()

      const response_time_minutes = ackMs ? (ackMs - detectedMs) / 60000 : null
      const resolution_time_hours = resolvedMs ? (resolvedMs - detectedMs) / 3600000 : null
      const duration_hours = (closedMs - detectedMs) / 3600000

      const playbookSteps = actions.filter((a) => a.action_type === 'playbook_step')
      const escalations = actions.filter((a) => a.action_type === 'escalation')
      const completedOrders = new Set(playbookSteps.map((a) => a.new_value).filter(Boolean))

      const playbook_compliance = playbook && playbook.steps.length > 0
        ? (completedOrders.size / playbook.steps.length) * 100
        : null

      const report = {
        incident_id: incident.id,
        summary: {
          title: incident.title,
          type: incident.type,
          severity: incident.severity,
          duration_hours: Number(duration_hours.toFixed(2)),
          municipalities: incident.affected_municipalities || [],
          actions_count: actions.length,
        },
        timeline: actions.map((a) => ({
          action_type: a.action_type,
          description: a.description,
          performed_at: a.performed_at,
        })),
        metrics: {
          response_time_minutes: response_time_minutes != null
            ? Number(response_time_minutes.toFixed(1))
            : null,
          resolution_time_hours: resolution_time_hours != null
            ? Number(resolution_time_hours.toFixed(2))
            : null,
          playbook_steps_completed: completedOrders.size,
          escalation_count: escalations.length,
        },
        playbook_compliance: playbook_compliance != null
          ? Number(playbook_compliance.toFixed(1))
          : null,
        lessons_learned: null,
        context_snapshot: incident.context || {},
        finalized_by: user?.id || null,
        finalized_at: new Date().toISOString(),
      }

      const { error } = await (supabase as any)
        .from('incident_reports')
        .upsert(report, { onConflict: 'incident_id' })

      if (error) throw error
    },
    onSuccess: (_data, { incident }) => {
      qc.invalidateQueries({ queryKey: ['incident-report', incident.id] })
    },
  })
}

export function useUpdateLessonsLearned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      incidentId,
      lessons,
    }: { incidentId: string; lessons: string }) => {
      const { error } = await (supabase as any)
        .from('incident_reports')
        .update({ lessons_learned: lessons })
        .eq('incident_id', incidentId)
      if (error) throw error
    },
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-report', incidentId] })
    },
  })
}
