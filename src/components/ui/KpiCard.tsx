// src/components/ui/KpiCard.tsx
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  subvalue?: string
  trend?: number        // percentual, positivo = bom, negativo = ruim
  icon?: ReactNode
  loading?: boolean
  accentColor?: 'green' | 'blue' | 'red' | 'yellow'
}

export function KpiCard({ label, value, subvalue, trend, icon, loading, accentColor = 'green' }: KpiCardProps) {
  const accentMap = {
    green: 'border-l-accent-green',
    blue: 'border-l-accent-blue',
    red: 'border-l-status-danger',
    yellow: 'border-l-status-warning',
  }

  if (loading) {
    return (
      <div className={`card p-4 border-l-2 ${accentMap[accentColor]} animate-pulse`}>
        <div className="h-3 bg-background-elevated rounded w-20 mb-3" />
        <div className="h-7 bg-background-elevated rounded w-28 mb-2" />
        <div className="h-3 bg-background-elevated rounded w-16" />
      </div>
    )
  }

  return (
    <div className={`card p-4 border-l-2 ${accentMap[accentColor]} hover:shadow-card-hover transition-all`}>
      <div className="flex items-start justify-between">
        <p className="kpi-label">{label}</p>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <p className="kpi-value mt-2">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      {(subvalue || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-1">
          {trend !== undefined && (
            <span className={cn(
              'text-xs font-mono font-medium',
              trend >= 0 ? 'text-status-success' : 'text-status-danger'
            )}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {subvalue && <span className="text-text-muted text-xs">{subvalue}</span>}
        </div>
      )}
    </div>
  )
}
