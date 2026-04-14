// src/pages/IncidentesPage.tsx
// Pagina de gestao de incidentes com Kanban OODA (Fase 4.C)
import { useState, useMemo } from 'react'
import { Shield, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveIncidents, useIncidentCounts } from '@/hooks/useIncidents'
import { IncidentCard } from '@/components/incidents/IncidentCard'
import { IncidentFilters, type FilterState } from '@/components/incidents/IncidentFilters'
import type { Incident, OodaPhase, IncidentStatus } from '@/types/incident'
import { STATUS_TO_OODA } from '@/types/incident'

// OODA columns configuration
const OODA_COLUMNS: Array<{
  phase: OodaPhase
  label: string
  statuses: IncidentStatus[]
  color: string
  bgColor: string
}> = [
  {
    phase: 'observe',
    label: 'Observe',
    statuses: ['detected', 'observing'],
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  {
    phase: 'orient',
    label: 'Orient',
    statuses: ['orienting'],
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20',
  },
  {
    phase: 'decide',
    label: 'Decide',
    statuses: ['deciding'],
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    phase: 'act',
    label: 'Act',
    statuses: ['acting', 'monitoring'],
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/20',
  },
]

export function IncidentesPage() {
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    severity: 'all',
    showResolved: false,
  })

  const { data, isLoading } = useActiveIncidents()
  const { data: counts } = useIncidentCounts()

  // Apply client-side filters
  const filteredIncidents = useMemo(() => {
    let items = data?.items || []

    if (filters.type !== 'all') {
      items = items.filter((i) => i.type === filters.type)
    }
    if (filters.severity !== 'all') {
      items = items.filter((i) => i.severity === filters.severity)
    }
    if (filters.showResolved) {
      // Already fetched only active; would need a separate query for resolved
      // For now this toggle is a no-op placeholder
    }

    return items
  }, [data?.items, filters])

  // Group by OODA phase
  const columnData = useMemo(() => {
    const grouped: Record<OodaPhase, Incident[]> = {
      observe: [],
      orient: [],
      decide: [],
      act: [],
    }

    for (const incident of filteredIncidents) {
      const phase = STATUS_TO_OODA[incident.status] || 'observe'
      grouped[phase].push(incident)
    }

    return grouped
  }, [filteredIncidents])

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Shield size={24} />
            Gestao de Incidentes
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Ciclo OODA: Observe, Orient, Decide, Act
          </p>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-3">
          {counts && (
            <>
              <StatBadge
                label="Ativos"
                value={counts.active}
                color="text-red-400"
              />
              <StatBadge
                label="Criticos"
                value={counts.bySeverity['critical'] || 0}
                color="text-red-500"
              />
              <StatBadge
                label="Total"
                value={counts.total}
                color="text-text-muted"
              />
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0">
        <IncidentFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-text-muted" />
        </div>
      ) : filteredIncidents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 grid grid-cols-4 gap-4 min-h-0 overflow-hidden">
          {OODA_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.phase}
              label={col.label}
              color={col.color}
              bgColor={col.bgColor}
              incidents={columnData[col.phase]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({
  label,
  color,
  bgColor,
  incidents,
}: {
  label: string
  color: string
  bgColor: string
  incidents: Incident[]
}) {
  return (
    <div className={cn(
      'flex flex-col rounded-xl border p-3',
      bgColor,
    )}>
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className={cn('text-sm font-semibold uppercase tracking-wider', color)}>
          {label}
        </h3>
        <span className={cn(
          'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
          incidents.length > 0 ? `${color} bg-white/10` : 'text-text-muted',
        )}>
          {incidents.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-0 pr-1">
        {incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
        {incidents.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4 italic">
            Nenhum incidente
          </p>
        )}
      </div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-secondary border border-border">
      <span className={cn('text-lg font-bold', color)}>{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
      <AlertTriangle size={48} className="mb-3 opacity-30" />
      <p className="text-lg font-medium">Nenhum incidente ativo</p>
      <p className="text-sm mt-1">
        Incidentes sao criados automaticamente quando alertas compostos disparam.
      </p>
    </div>
  )
}
