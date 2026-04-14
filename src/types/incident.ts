// src/types/incident.ts
// Tipos e Zod schemas para o sistema de incidentes (Fase 4)

import { z } from 'zod'

// ─── Enums ─────────────────────────────────────────────────────────

export const INCIDENT_TYPES = [
  'incendio', 'enchente', 'surto', 'seca',
  'qualidade_ar', 'onda_calor', 'deslizamento', 'outro',
] as const

export const INCIDENT_STATUSES = [
  'detected', 'observing', 'orienting', 'deciding',
  'acting', 'monitoring', 'resolved', 'closed',
] as const

export const OODA_PHASES = ['observe', 'orient', 'decide', 'act'] as const

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const

export const ACTION_TYPES = [
  'status_change', 'assignment', 'note', 'playbook_step',
  'escalation', 'notification_sent', 'external_contact',
  'resolution', 'reopen',
] as const

export type IncidentType = typeof INCIDENT_TYPES[number]
export type IncidentStatus = typeof INCIDENT_STATUSES[number]
export type OodaPhase = typeof OODA_PHASES[number]
export type Severity = typeof SEVERITIES[number]
export type ActionType = typeof ACTION_TYPES[number]

// ─── Status transitions ────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  detected: ['observing'],
  observing: ['orienting'],
  orienting: ['deciding'],
  deciding: ['acting'],
  acting: ['monitoring'],
  monitoring: ['resolved', 'observing'],
  resolved: ['closed', 'observing'],
  closed: [],
}

export const STATUS_TO_OODA: Record<IncidentStatus, OodaPhase> = {
  detected: 'observe',
  observing: 'observe',
  orienting: 'orient',
  deciding: 'decide',
  acting: 'act',
  monitoring: 'act',
  resolved: 'act',
  closed: 'act',
}

// ─── Interfaces ────────────────────────────────────────────────────

export interface Incident {
  id: string
  title: string
  description: string | null
  type: IncidentType
  severity: Severity
  status: IncidentStatus
  ooda_phase: OodaPhase
  affected_municipalities: Array<{ ibge_code: string; name: string }>
  affected_population: number | null
  source_alert_id: string | null
  source_notification_id: string | null
  playbook_id: string | null
  assigned_to: string | null
  context: Record<string, unknown>
  detected_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  closed_at: string | null
  resolution_summary: string | null
  created_by: string | null
  updated_at: string
}

export interface IncidentAction {
  id: string
  incident_id: string
  action_type: ActionType
  description: string
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown>
  performed_by: string | null
  performed_at: string
}

export interface PlaybookStep {
  order: number
  title: string
  description: string
  responsible_role: 'viewer' | 'operator' | 'commander'
  estimated_minutes: number
  is_critical: boolean
}

export interface Playbook {
  id: string
  name: string
  description: string | null
  incident_type: string
  severity_min: Severity
  steps: PlaybookStep[]
  estimated_duration_minutes: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Zod schemas (for mutations) ───────────────────────────────────

export const updateIncidentStatusSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
})

export const addIncidentNoteSchema = z.object({
  description: z.string().min(1).max(2000),
})

export const assignIncidentSchema = z.object({
  assigned_to: z.string().uuid(),
})

export const resolveIncidentSchema = z.object({
  resolution_summary: z.string().min(1).max(5000),
})

// ─── Display helpers ───────────────────────────────────────────────

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  incendio: 'Incendio Florestal',
  enchente: 'Enchente / Inundacao',
  surto: 'Surto Epidemiologico',
  seca: 'Seca / Estiagem',
  qualidade_ar: 'Qualidade do Ar',
  onda_calor: 'Onda de Calor',
  deslizamento: 'Deslizamento',
  outro: 'Outro',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Baixo',
}

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  detected: 'Detectado',
  observing: 'Observando',
  orienting: 'Orientando',
  deciding: 'Decidindo',
  acting: 'Atuando',
  monitoring: 'Monitorando',
  resolved: 'Resolvido',
  closed: 'Encerrado',
}
