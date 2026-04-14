// src/components/incidents/IncidentStatusStepper.tsx
// OODA phase stepper with status transition buttons
import { Check, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChangeIncidentStatus } from '@/hooks/useIncidentActions'
import type { IncidentStatus, OodaPhase } from '@/types/incident'
import { VALID_TRANSITIONS, STATUS_LABELS, STATUS_TO_OODA } from '@/types/incident'

const OODA_PHASES: OodaPhase[] = ['observe', 'orient', 'decide', 'act']
const PHASE_LABELS: Record<OodaPhase, string> = {
  observe: 'Observe',
  orient: 'Orient',
  decide: 'Decide',
  act: 'Act',
}

export function IncidentStatusStepper({
  incidentId,
  currentStatus,
}: {
  incidentId: string
  currentStatus: IncidentStatus
}) {
  const changeStatus = useChangeIncidentStatus()
  const currentPhase = STATUS_TO_OODA[currentStatus]
  const currentPhaseIdx = OODA_PHASES.indexOf(currentPhase)
  const nextStatuses = VALID_TRANSITIONS[currentStatus] || []

  return (
    <div className="space-y-3">
      {/* Phase stepper */}
      <div className="flex items-center gap-0">
        {OODA_PHASES.map((phase, idx) => {
          const isPast = idx < currentPhaseIdx
          const isActive = idx === currentPhaseIdx
          return (
            <div key={phase} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                  isPast && 'bg-accent-green border-accent-green text-white',
                  isActive && 'bg-accent-green/20 border-accent-green text-accent-green',
                  !isPast && !isActive && 'bg-background-secondary border-border text-text-muted',
                )}>
                  {isPast ? <Check size={14} /> : idx + 1}
                </div>
                <span className={cn(
                  'text-xs mt-1 font-medium',
                  isActive ? 'text-accent-green' : isPast ? 'text-text-secondary' : 'text-text-muted',
                )}>
                  {PHASE_LABELS[phase]}
                </span>
              </div>
              {idx < OODA_PHASES.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mx-1 transition-colors',
                  idx < currentPhaseIdx ? 'bg-accent-green' : 'bg-border',
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current status + transition buttons */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background-elevated border border-border">
        <div>
          <p className="text-xs text-text-muted">Status atual</p>
          <p className="text-sm font-semibold text-text-primary">
            {STATUS_LABELS[currentStatus]}
          </p>
        </div>

        {nextStatuses.length > 0 ? (
          <div className="flex items-center gap-2">
            {nextStatuses.map((next) => (
              <button
                key={next}
                onClick={() => changeStatus.mutate({ id: incidentId, newStatus: next })}
                disabled={changeStatus.isPending}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                  'bg-accent-green text-white hover:bg-accent-green/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                )}
              >
                {changeStatus.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ArrowRight size={12} />
                )}
                {STATUS_LABELS[next]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">
            Incidente encerrado
          </span>
        )}
      </div>

      {changeStatus.isError && (
        <p className="text-xs text-red-400">
          Erro: {(changeStatus.error as Error).message}
        </p>
      )}
    </div>
  )
}
