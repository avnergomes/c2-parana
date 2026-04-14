// src/components/incidents/IncidentTimeline.tsx
// Chronological audit trail of incident actions
import {
  ArrowRight, UserPlus, MessageSquare, CheckSquare,
  AlertTriangle, Bell, Phone, CheckCircle2, RotateCcw, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IncidentAction, ActionType } from '@/types/incident'

const ACTION_ICONS: Record<ActionType, typeof ArrowRight> = {
  status_change: ArrowRight,
  assignment: UserPlus,
  note: MessageSquare,
  playbook_step: CheckSquare,
  escalation: AlertTriangle,
  notification_sent: Bell,
  external_contact: Phone,
  resolution: CheckCircle2,
  reopen: RotateCcw,
}

const ACTION_COLORS: Record<ActionType, string> = {
  status_change: 'text-blue-400 bg-blue-500/10',
  assignment: 'text-purple-400 bg-purple-500/10',
  note: 'text-text-secondary bg-background-elevated',
  playbook_step: 'text-green-400 bg-green-500/10',
  escalation: 'text-orange-400 bg-orange-500/10',
  notification_sent: 'text-yellow-400 bg-yellow-500/10',
  external_contact: 'text-indigo-400 bg-indigo-500/10',
  resolution: 'text-accent-green bg-accent-green/10',
  reopen: 'text-red-400 bg-red-500/10',
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min atras`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h atras`

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function IncidentTimeline({
  actions,
  isLoading,
}: {
  actions: IncidentAction[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <Clock className="animate-spin" size={24} />
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        <Clock size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma acao registrada ainda</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {actions.map((action, idx) => {
        const Icon = ACTION_ICONS[action.action_type] || MessageSquare
        const colorClass = ACTION_COLORS[action.action_type] || 'text-text-secondary bg-background-elevated'
        const isLast = idx === actions.length - 1

        return (
          <div key={action.id} className="flex gap-3 relative">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
            )}

            {/* Icon */}
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 relative z-10',
              colorClass,
            )}>
              <Icon size={14} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-4">
              <p className="text-sm text-text-primary break-words">
                {action.description}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatTime(action.performed_at)}
                {action.performed_by && ' · operador'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
