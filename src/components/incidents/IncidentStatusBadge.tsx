// src/components/incidents/IncidentStatusBadge.tsx
import { cn } from '@/lib/utils'
import type { IncidentStatus, Severity } from '@/types/incident'
import { STATUS_LABELS } from '@/types/incident'

const STATUS_STYLES: Record<IncidentStatus, string> = {
  detected: 'bg-red-100 text-red-800 border-red-300',
  observing: 'bg-orange-100 text-orange-800 border-orange-300',
  orienting: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  deciding: 'bg-blue-100 text-blue-800 border-blue-300',
  acting: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  monitoring: 'bg-purple-100 text-purple-800 border-purple-300',
  resolved: 'bg-green-100 text-green-800 border-green-300',
  closed: 'bg-gray-100 text-gray-600 border-gray-300',
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-blue-400 text-white',
}

export function IncidentStatusBadge({
  status,
  className,
}: {
  status: IncidentStatus
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      STATUS_STYLES[status] || 'bg-gray-100 text-gray-600',
      className,
    )}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity
  className?: string
}) {
  const labels: Record<Severity, string> = {
    critical: 'Critico',
    high: 'Alto',
    medium: 'Medio',
    low: 'Baixo',
  }
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
      SEVERITY_STYLES[severity],
      className,
    )}>
      {labels[severity]}
    </span>
  )
}
