// src/components/incidents/IncidentPlaybookExec.tsx
// Step-by-step playbook execution with checkboxes
import { useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, Circle, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlaybooks, usePlaybookForIncident, useAssociatePlaybook } from '@/hooks/usePlaybooks'
import { useRecordPlaybookStep } from '@/hooks/useIncidentActions'
import type { Incident, IncidentAction, Playbook, PlaybookStep } from '@/types/incident'

export function IncidentPlaybookExec({
  incident,
  actions,
}: {
  incident: Incident
  actions: IncidentAction[]
}) {
  const { data: playbooks } = usePlaybooks()
  const suggested = usePlaybookForIncident(incident.type, incident.severity)
  const associate = useAssociatePlaybook()

  // Find the playbook to display: either associated or suggested
  const playbook = useMemo<Playbook | null>(() => {
    if (incident.playbook_id && playbooks) {
      return playbooks.find((p) => p.id === incident.playbook_id) || null
    }
    return suggested
  }, [incident.playbook_id, playbooks, suggested])

  // Compute which steps are done from timeline
  const completedOrders = useMemo(() => {
    const done = new Set<number>()
    for (const action of actions) {
      if (action.action_type === 'playbook_step' && action.new_value) {
        const order = parseInt(action.new_value, 10)
        if (!isNaN(order)) done.add(order)
      }
    }
    return done
  }, [actions])

  if (!playbook) {
    return (
      <div className="p-4 rounded-lg bg-background-secondary border border-border text-center">
        <BookOpen size={24} className="mx-auto mb-2 text-text-muted opacity-50" />
        <p className="text-sm text-text-muted">
          Nenhum playbook disponivel para este tipo de incidente
        </p>
      </div>
    )
  }

  const steps = (playbook.steps || []) as PlaybookStep[]
  const progress = steps.length > 0 ? (completedOrders.size / steps.length) * 100 : 0
  const isAssociated = incident.playbook_id === playbook.id

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-accent-green" />
            <h3 className="text-sm font-semibold text-text-primary">
              Playbook: {playbook.name}
            </h3>
            {!isAssociated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 uppercase font-bold">
                Sugerido
              </span>
            )}
          </div>
          {playbook.description && (
            <p className="text-xs text-text-muted mt-1">{playbook.description}</p>
          )}
        </div>

        {!isAssociated && (
          <button
            onClick={() => associate.mutate({ incidentId: incident.id, playbookId: playbook.id })}
            disabled={associate.isPending}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium flex-shrink-0',
              'bg-accent-green text-white hover:bg-accent-green/90',
              'disabled:opacity-50 transition-colors',
            )}
          >
            {associate.isPending ? 'Associando...' : 'Aceitar'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">
            {completedOrders.size} de {steps.length} passos concluidos
          </span>
          <span className="text-text-secondary font-medium">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-green transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => (
          <StepItem
            key={step.order}
            step={step}
            isDone={completedOrders.has(step.order)}
            incidentId={incident.id}
          />
        ))}
      </div>
    </div>
  )
}

function StepItem({
  step,
  isDone,
  incidentId,
}: {
  step: PlaybookStep
  isDone: boolean
  incidentId: string
}) {
  const [notes, setNotes] = useState('')
  const [expanded, setExpanded] = useState(false)
  const recordStep = useRecordPlaybookStep()

  const handleComplete = () => {
    if (isDone) return
    recordStep.mutate(
      {
        incidentId,
        stepOrder: step.order,
        stepTitle: step.title,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setNotes('')
          setExpanded(false)
        },
      },
    )
  }

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      isDone
        ? 'bg-green-500/5 border-green-500/20'
        : 'bg-background-secondary border-border',
    )}>
      <div className="p-3 flex items-start gap-3">
        <button
          onClick={handleComplete}
          disabled={isDone || recordStep.isPending}
          className="flex-shrink-0 mt-0.5 disabled:cursor-not-allowed"
        >
          {recordStep.isPending ? (
            <Loader2 size={18} className="animate-spin text-text-muted" />
          ) : isDone ? (
            <CheckCircle2 size={18} className="text-accent-green" />
          ) : (
            <Circle size={18} className="text-text-muted hover:text-accent-green transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn(
              'text-sm font-medium',
              isDone ? 'text-text-muted line-through' : 'text-text-primary',
            )}>
              {step.order}. {step.title}
            </p>
            {step.is_critical && !isDone && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 uppercase font-bold">
                <AlertCircle size={10} />
                Critico
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">{step.description}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {step.estimated_minutes}min
            </span>
            <span>Responsavel: {step.responsible_role}</span>
          </div>

          {/* Notes expansion */}
          {!isDone && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-accent-green hover:underline mt-2"
            >
              {expanded ? 'Cancelar' : '+ Adicionar nota'}
            </button>
          )}

          {!isDone && expanded && (
            <div className="mt-2 space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre a execucao deste passo..."
                rows={2}
                className={cn(
                  'w-full px-2 py-1.5 text-xs rounded border border-border',
                  'bg-background-elevated text-text-primary',
                  'focus:outline-none focus:ring-1 focus:ring-accent-green',
                )}
              />
              <button
                onClick={handleComplete}
                disabled={recordStep.isPending}
                className={cn(
                  'px-3 py-1 text-xs rounded-md font-medium',
                  'bg-accent-green text-white hover:bg-accent-green/90',
                  'disabled:opacity-50',
                )}
              >
                Marcar como concluido
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
