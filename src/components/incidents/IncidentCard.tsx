// src/components/incidents/IncidentCard.tsx
import { Link } from 'react-router-dom'
import { Clock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IncidentSeverityIcon } from './IncidentSeverityIcon'
import { SeverityBadge } from './IncidentStatusBadge'
import type { Incident } from '@/types/incident'
import { INCIDENT_TYPE_LABELS } from '@/types/incident'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-blue-400',
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const municipalities = incident.affected_municipalities || []
  const firstMun = municipalities[0]?.name || ''
  const extraCount = municipalities.length - 1

  return (
    <Link
      to={`/incidentes/${incident.id}`}
      className={cn(
        'block p-3 rounded-lg border border-border border-l-4 bg-background-secondary',
        'hover:bg-background-elevated transition-colors cursor-pointer',
        SEVERITY_BORDER[incident.severity] || 'border-l-gray-400',
      )}
    >
      {/* Header: icon + title + severity */}
      <div className="flex items-start gap-2">
        <IncidentSeverityIcon type={incident.type} size={16} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {incident.title}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {INCIDENT_TYPE_LABELS[incident.type]}
          </p>
        </div>
        <SeverityBadge severity={incident.severity} />
      </div>

      {/* Municipality */}
      {firstMun && (
        <p className="text-xs text-text-secondary mt-2 truncate">
          {firstMun}
          {extraCount > 0 && ` +${extraCount}`}
        </p>
      )}

      {/* Footer: time + assignee */}
      <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {timeAgo(incident.detected_at)}
        </span>
        {incident.assigned_to && (
          <span className="flex items-center gap-1">
            <User size={12} />
            Atribuido
          </span>
        )}
      </div>
    </Link>
  )
}
