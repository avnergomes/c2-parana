// src/hooks/useIncidentActions.ts
// Mutations para registrar acoes em incidentes (Fase 4.B)
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { IncidentStatus, ActionType } from '@/types/incident'
import { VALID_TRANSITIONS } from '@/types/incident'

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export function useChangeIncidentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: IncidentStatus }) => {
      // Fetch current status to validate transition
      const { data: incident, error: fetchErr } = await (supabase as any)
        .from('incidents')
        .select('status')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const currentStatus = (incident as any).status as IncidentStatus
      const allowed = VALID_TRANSITIONS[currentStatus] || []
      if (!allowed.includes(newStatus)) {
        throw new Error(`Transicao invalida: ${currentStatus} -> ${newStatus}`)
      }

      const userId = await getCurrentUserId()

      // Update incident status
      const { error: updateErr } = await (supabase as any)
        .from('incidents')
        .update({ status: newStatus })
        .eq('id', id)
      if (updateErr) throw updateErr

      // Record action in audit trail
      const { error: actionErr } = await (supabase as any)
        .from('incident_actions')
        .insert({
          incident_id: id,
          action_type: 'status_change' as ActionType,
          description: `Status alterado de ${currentStatus} para ${newStatus}`,
          old_value: currentStatus,
          new_value: newStatus,
          performed_by: userId,
        })
      if (actionErr) throw actionErr
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incidents-counts'] })
      qc.invalidateQueries({ queryKey: ['incident-actions', id] })
    },
  })
}

export function useAddIncidentNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ incidentId, description }: { incidentId: string; description: string }) => {
      const userId = await getCurrentUserId()
      const { error } = await (supabase as any)
        .from('incident_actions')
        .insert({
          incident_id: incidentId,
          action_type: 'note' as ActionType,
          description,
          performed_by: userId,
        })
      if (error) throw error
    },
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-actions', incidentId] })
    },
  })
}

export function useAssignIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, assignTo }: { id: string; assignTo: string }) => {
      const userId = await getCurrentUserId()

      const { data: incident } = await (supabase as any)
        .from('incidents')
        .select('assigned_to')
        .eq('id', id)
        .single()

      const oldAssignee = (incident as any)?.assigned_to || null

      const { error: updateErr } = await (supabase as any)
        .from('incidents')
        .update({ assigned_to: assignTo })
        .eq('id', id)
      if (updateErr) throw updateErr

      const { error: actionErr } = await (supabase as any)
        .from('incident_actions')
        .insert({
          incident_id: id,
          action_type: 'assignment' as ActionType,
          description: `Incidente atribuido a ${assignTo}`,
          old_value: oldAssignee,
          new_value: assignTo,
          performed_by: userId,
        })
      if (actionErr) throw actionErr
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incident-actions', id] })
    },
  })
}

export function useResolveIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, summary }: { id: string; summary: string }) => {
      const userId = await getCurrentUserId()

      const { error: updateErr } = await (supabase as any)
        .from('incidents')
        .update({ status: 'resolved', resolution_summary: summary })
        .eq('id', id)
      if (updateErr) throw updateErr

      const { error: actionErr } = await (supabase as any)
        .from('incident_actions')
        .insert({
          incident_id: id,
          action_type: 'resolution' as ActionType,
          description: summary,
          new_value: 'resolved',
          performed_by: userId,
        })
      if (actionErr) throw actionErr
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['incident', id] })
      qc.invalidateQueries({ queryKey: ['incidents'] })
      qc.invalidateQueries({ queryKey: ['incidents-counts'] })
      qc.invalidateQueries({ queryKey: ['incident-actions', id] })
    },
  })
}

export function useRecordPlaybookStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      incidentId,
      stepOrder,
      stepTitle,
      notes,
    }: {
      incidentId: string
      stepOrder: number
      stepTitle: string
      notes?: string
    }) => {
      const userId = await getCurrentUserId()
      const { error } = await (supabase as any)
        .from('incident_actions')
        .insert({
          incident_id: incidentId,
          action_type: 'playbook_step' as ActionType,
          description: notes
            ? `Passo ${stepOrder}: ${stepTitle} — ${notes}`
            : `Passo ${stepOrder}: ${stepTitle}`,
          new_value: String(stepOrder),
          metadata: { step_order: stepOrder, step_title: stepTitle },
          performed_by: userId,
        })
      if (error) throw error
    },
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-actions', incidentId] })
    },
  })
}
