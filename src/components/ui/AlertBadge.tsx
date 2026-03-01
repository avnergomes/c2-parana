// src/components/ui/AlertBadge.tsx
import { cn } from '@/lib/utils'

type BadgeLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

interface AlertBadgeProps {
  level: BadgeLevel
  label?: string
  count?: number
  className?: string
}

const BADGE_STYLES: Record<BadgeLevel, string> = {
  critical: 'bg-red-900/40 text-status-danger border-red-700/50',
  high: 'bg-orange-900/40 text-orange-400 border-orange-700/50',
  medium: 'bg-amber-900/40 text-status-warning border-amber-700/50',
  low: 'bg-emerald-900/40 text-status-success border-emerald-700/50',
  info: 'bg-blue-900/40 text-status-info border-blue-700/50',
}

const BADGE_LABELS: Record<BadgeLevel, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
}

export function AlertBadge({ level, label, count, className }: AlertBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border',
      BADGE_STYLES[level],
      className
    )}>
      {label || BADGE_LABELS[level]}
      {count !== undefined && (
        <span className="font-mono font-bold">{count}</span>
      )}
    </span>
  )
}
