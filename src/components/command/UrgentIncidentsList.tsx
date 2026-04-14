// src/components/command/UrgentIncidentsList.tsx
import { Link } from 'react-router-dom'
import { Clock, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IncidentSeverityIcon } from '@/components/incidents/IncidentSeverityIcon'
import { SeverityBadge } from '@/components/incidents/IncidentStatusBadge'
import type { UrgentIncident } from '@/hooks/useCommandDashboard'
import { INCIDENT_TYPE_LABELS } from '@/types/incident'

export function UrgentIncidentsList({
  incidents,
  isLoading,
}: {
  incidents: UrgentIncident[] | undefined
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="p-6 text-center text-text-muted text-sm">
        Carregando incidentes urgentes...
      </div>
    )
  }

  if (!incidents || incidents.length === 0) {
    return (
      <div className="p-6 text-center text-text-muted">
        <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhum incidente urgente sem atendimento</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {incidents.map((incident) => {
        const muni = incident.affected_municipalities?.[0]?.name || ''
        const isOverdue = (incident.severity === 'critical' && incident.ageMinutes > 15)
          || (incident.severity === 'high' && incident.ageMinutes > 60)

        return (
          <Link
            key={incident.id}
            to={`/incidentes/${incident.id}`}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border border-border bg-background-secondary',
              'hover:bg-background-elevated transition-colors',
              isOverdue && 'border-red-500/30',
            )}
          >
            <IncidentSeverityIcon type={incident.type} size={20} className="flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text-primary truncate">
                  {incident.title}
                </p>
                <SeverityBadge severity={incident.severity} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                <span>{INCIDENT_TYPE_LABELS[incident.type]}</span>
                {muni && <span>·</span>}
                {muni && <span>{muni}</span>}
                <span>·</span>
                <span className={cn(
                  'flex items-center gap-1',
                  isOverdue && 'text-red-400 font-semibold',
                )}>
                  <Clock size={10} />
                  {incident.ageMinutes}min
                  {isOverdue && ' (atrasado)'}
                </span>
              </div>
            </div>

            <ChevronRight size={16} className="text-text-muted flex-shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}
