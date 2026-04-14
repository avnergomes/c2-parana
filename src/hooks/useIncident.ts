// src/hooks/useIncident.ts
// Detalhe de um incidente + actions + realtime (Fase 4.B)
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Incident, IncidentAction } from '@/types/incident'

export function useIncident(id: string | undefined) {
  const queryClient = useQueryClient()

  // Realtime subscription for this incident
  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`incident-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'incidents', filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incident', id] })
          queryClient.invalidateQueries({ queryKey: ['incidents'] })
          queryClient.invalidateQueries({ queryKey: ['incidents-counts'] })
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incident_actions', filter: `incident_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incident-actions', id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, queryClient])

  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await (supabase as any)
        .from('incidents')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Incident
    },
    enabled: !!id,
    staleTime: 1000 * 30,
  })
}

export function useIncidentTimeline(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['incident-actions', incidentId],
    queryFn: async () => {
      if (!incidentId) return []
      const { data, error } = await (supabase as any)
        .from('incident_actions')
        .select('*')
        .eq('incident_id', incidentId)
        .order('performed_at', { ascending: false })

      if (error) throw error
      return (data || []) as IncidentAction[]
    },
    enabled: !!incidentId,
    staleTime: 1000 * 30,
  })
}
