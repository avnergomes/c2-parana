// src/hooks/usePlaybooks.ts
// Lista playbooks e associa a incidentes (Fase 4.B)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Playbook, IncidentType, Severity } from '@/types/incident'

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

export function usePlaybooks() {
  return useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('playbooks')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return (data || []) as Playbook[]
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function usePlaybookForIncident(type: IncidentType, severity: Severity) {
  const { data: playbooks } = usePlaybooks()

  if (!playbooks) return null

  // Find best matching playbook: same incident_type, severity >= severity_min
  const incidentSev = SEVERITY_ORDER[severity] ?? 0
  const candidates = playbooks.filter((p) => {
    const minSev = SEVERITY_ORDER[p.severity_min] ?? 0
    return p.incident_type === type && incidentSev >= minSev
  })

  // Return first match (ordered by name)
  return candidates[0] ?? null
}

export function useAssociatePlaybook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, playbookId }: { incidentId: string; playbookId: string }) => {
      const { error } = await (supabase as any)
        .from('incidents')
        .update({ playbook_id: playbookId })
        .eq('id', incidentId)
      if (error) throw error
    },
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] })
    },
  })
}
