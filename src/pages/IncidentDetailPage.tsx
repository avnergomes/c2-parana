// src/pages/IncidentDetailPage.tsx
// Incident detail page with OODA context, timeline, and playbook execution (Fase 4.D)
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertTriangle, Clock, CheckCircle2, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIncident, useIncidentTimeline } from '@/hooks/useIncident'
import { useResolveIncident } from '@/hooks/useIncidentActions'
import { useState } from 'react'
import { IncidentSeverityIcon } from '@/components/incidents/IncidentSeverityIcon'
import { SeverityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentStatusBadge'
import { IncidentStatusStepper } from '@/components/incidents/IncidentStatusStepper'
import { IncidentContext } from '@/components/incidents/IncidentContext'
import { IncidentTimeline } from '@/components/incidents/IncidentTimeline'
import { IncidentPlaybookExec } from '@/components/incidents/IncidentPlaybookExec'
import { AddActionForm } from '@/components/incidents/AddActionForm'
import { IncidentReport } from '@/components/incidents/IncidentReport'
import { INCIDENT_TYPE_LABELS } from '@/types/incident'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatElapsed(detected: string, resolved: string | null): string {
  const end = resolved ? new Date(resolved).getTime() : Date.now()
  const diffMs = end - new Date(detected).getTime()
  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  if (hours === 0) return `${minutes}min`
  return `${hours}h ${minutes}min`
}

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: incident, isLoading } = useIncident(id)
  const { data: actions = [], isLoading: actionsLoading } = useIncidentTimeline(id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={48} className="text-text-muted opacity-30" />
        <p className="text-text-muted">Incidente nao encontrado</p>
        <Link to="/incidentes" className="text-accent-green hover:underline text-sm">
          Voltar para lista
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <Link
          to="/incidentes"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar para incidentes
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <IncidentSeverityIcon type={incident.type} size={32} className="mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary">{incident.title}</h1>
              <SeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary flex-wrap">
              <span>{INCIDENT_TYPE_LABELS[incident.type]}</span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Detectado {formatDateTime(incident.detected_at)}
              </span>
              <span className="flex items-center gap-1">
                <Hash size={12} />
                {formatElapsed(incident.detected_at, incident.resolved_at)} decorrido
              </span>
            </div>
            {incident.description && (
              <p className="text-sm text-text-secondary mt-2">{incident.description}</p>
            )}
          </div>
        </div>

        {/* OODA Stepper */}
        <div className="mb-6">
          <IncidentStatusStepper
            incidentId={incident.id}
            currentStatus={incident.status}
          />
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column (60%): context + playbook */}
          <div className="lg:col-span-3 space-y-6">
            {/* ORIENT context */}
            <IncidentContext incident={incident} />

            {/* Playbook execution */}
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                Playbook (Decide / Act)
              </h3>
              <IncidentPlaybookExec incident={incident} actions={actions} />
            </div>

            {/* Resolution form (only if not already closed/resolved) */}
            {incident.status !== 'closed' && incident.status !== 'resolved' && (
              <ResolveForm incidentId={incident.id} />
            )}

            {/* Post-incident report (only when closed/resolved) */}
            {(incident.status === 'resolved' || incident.status === 'closed') && (
              <IncidentReport incident={incident} actions={actions} />
            )}

            {/* Resolution summary (if resolved/closed) */}
            {(incident.status === 'resolved' || incident.status === 'closed') && incident.resolution_summary && (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-accent-green" />
                  <h4 className="text-sm font-semibold text-text-primary">Resolucao</h4>
                </div>
                <p className="text-sm text-text-secondary">{incident.resolution_summary}</p>
                {incident.resolved_at && (
                  <p className="text-xs text-text-muted mt-2">
                    Resolvido em {formatDateTime(incident.resolved_at)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right column (40%): timeline */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Linha do Tempo
            </h3>
            <AddActionForm incidentId={incident.id} />
            <div className="p-4 rounded-lg bg-background-secondary border border-border">
              <IncidentTimeline actions={actions} isLoading={actionsLoading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResolveForm({ incidentId }: { incidentId: string }) {
  const [summary, setSummary] = useState('')
  const [open, setOpen] = useState(false)
  const resolve = useResolveIncident()

  const handleSubmit = () => {
    if (!summary.trim()) return
    resolve.mutate(
      { id: incidentId, summary: summary.trim() },
      {
        onSuccess: () => {
          setOpen(false)
          setSummary('')
        },
      },
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'w-full py-2.5 rounded-lg border border-dashed border-border text-sm',
          'text-text-muted hover:text-text-primary hover:border-accent-green',
          'transition-colors',
        )}
      >
        + Marcar como resolvido
      </button>
    )
  }

  return (
    <div className="p-4 rounded-lg bg-background-secondary border border-border space-y-3">
      <h4 className="text-sm font-semibold text-text-primary">Resolver Incidente</h4>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Descreva como o incidente foi resolvido..."
        rows={4}
        className={cn(
          'w-full px-3 py-2 text-sm rounded border border-border',
          'bg-background-elevated text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-accent-green',
          'resize-none',
        )}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs rounded-md text-text-muted hover:text-text-primary transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!summary.trim() || resolve.isPending}
          className={cn(
            'px-3 py-1.5 text-xs rounded-md font-medium',
            'bg-accent-green text-white hover:bg-accent-green/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {resolve.isPending ? 'Resolvendo...' : 'Confirmar resolucao'}
        </button>
      </div>
    </div>
  )
}
