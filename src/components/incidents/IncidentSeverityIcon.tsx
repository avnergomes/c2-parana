// src/components/incidents/IncidentSeverityIcon.tsx
import { Flame, CloudRain, Bug, Sun, Wind, Thermometer, Mountain, AlertTriangle } from 'lucide-react'
import type { IncidentType } from '@/types/incident'

const ICON_MAP: Record<IncidentType, typeof Flame> = {
  incendio: Flame,
  enchente: CloudRain,
  surto: Bug,
  seca: Sun,
  qualidade_ar: Wind,
  onda_calor: Thermometer,
  deslizamento: Mountain,
  outro: AlertTriangle,
}

const COLOR_MAP: Record<IncidentType, string> = {
  incendio: 'text-orange-500',
  enchente: 'text-blue-500',
  surto: 'text-green-500',
  seca: 'text-yellow-500',
  qualidade_ar: 'text-gray-400',
  onda_calor: 'text-red-400',
  deslizamento: 'text-amber-700',
  outro: 'text-text-muted',
}

export function IncidentSeverityIcon({
  type,
  size = 18,
  className = '',
}: {
  type: IncidentType
  size?: number
  className?: string
}) {
  const Icon = ICON_MAP[type] || AlertTriangle
  const color = COLOR_MAP[type] || 'text-text-muted'
  return <Icon size={size} className={`${color} ${className}`} />
}
