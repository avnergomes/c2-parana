// src/components/incidents/IncidentFilters.tsx
import { cn } from '@/lib/utils'
import type { IncidentType, Severity } from '@/types/incident'
import { INCIDENT_TYPES, SEVERITIES, INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from '@/types/incident'

export interface FilterState {
  type: IncidentType | 'all'
  severity: Severity | 'all'
  showResolved: boolean
}

export function IncidentFilters({
  filters,
  onChange,
}: {
  filters: FilterState
  onChange: (filters: FilterState) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Type filter */}
      <select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value as IncidentType | 'all' })}
        className={cn(
          'px-3 py-1.5 rounded-lg text-sm border border-border',
          'bg-background-secondary text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-accent-green',
        )}
      >
        <option value="all">Todos os tipos</option>
        {INCIDENT_TYPES.map((t) => (
          <option key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</option>
        ))}
      </select>

      {/* Severity filter */}
      <select
        value={filters.severity}
        onChange={(e) => onChange({ ...filters, severity: e.target.value as Severity | 'all' })}
        className={cn(
          'px-3 py-1.5 rounded-lg text-sm border border-border',
          'bg-background-secondary text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-accent-green',
        )}
      >
        <option value="all">Todas severidades</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
        ))}
      </select>

      {/* Show resolved toggle */}
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={filters.showResolved}
          onChange={(e) => onChange({ ...filters, showResolved: e.target.checked })}
          className="rounded border-border text-accent-green focus:ring-accent-green"
        />
        Exibir resolvidos
      </label>
    </div>
  )
}
