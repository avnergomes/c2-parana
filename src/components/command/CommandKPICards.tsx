// src/components/command/CommandKPICards.tsx
import { AlertTriangle, Clock, ShieldCheck, MapPin, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommandKPIs } from '@/hooks/useCommandDashboard'

export function CommandKPICards({ kpis }: { kpis: CommandKPIs | undefined }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPICard
        icon={<AlertTriangle size={20} />}
        label="Incidentes Ativos"
        value={kpis?.activeIncidents ?? '—'}
        sublabel={
          kpis
            ? `${kpis.activeBySeverity.critical} criticos, ${kpis.activeBySeverity.high} altos`
            : ''
        }
        accent={
          kpis && kpis.activeBySeverity.critical > 0
            ? 'red'
            : kpis && kpis.activeIncidents > 0
              ? 'orange'
              : 'green'
        }
      />

      <KPICard
        icon={<Clock size={20} />}
        label="Tempo Medio de Resposta"
        value={
          kpis?.avgResponseMinutes != null
            ? `${kpis.avgResponseMinutes.toFixed(0)}min`
            : 'sem dados'
        }
        sublabel="ultimas 24h"
        accent={
          kpis?.avgResponseMinutes == null
            ? 'gray'
            : kpis.avgResponseMinutes <= 30
              ? 'green'
              : kpis.avgResponseMinutes <= 60
                ? 'orange'
                : 'red'
        }
      />

      <KPICard
        icon={<ShieldCheck size={20} />}
        label="SLA Compliance"
        value={
          kpis?.slaCompliancePct != null
            ? `${kpis.slaCompliancePct.toFixed(0)}%`
            : 'sem dados'
        }
        sublabel="resposta dentro do SLA"
        accent={
          kpis?.slaCompliancePct == null
            ? 'gray'
            : kpis.slaCompliancePct >= 90
              ? 'green'
              : kpis.slaCompliancePct >= 70
                ? 'orange'
                : 'red'
        }
      />

      <KPICard
        icon={<MapPin size={20} />}
        label="Municipios Alto Risco"
        value={kpis?.highRiskMunis ?? '—'}
        sublabel="IRTC > 60"
        accent={
          !kpis
            ? 'gray'
            : kpis.highRiskMunis > 20
              ? 'red'
              : kpis.highRiskMunis > 10
                ? 'orange'
                : 'green'
        }
      />
    </div>
  )
}

const ACCENT_COLORS: Record<string, { border: string; icon: string; text: string }> = {
  red: { border: 'border-l-red-500', icon: 'text-red-400', text: 'text-red-400' },
  orange: { border: 'border-l-orange-500', icon: 'text-orange-400', text: 'text-orange-400' },
  green: { border: 'border-l-accent-green', icon: 'text-accent-green', text: 'text-accent-green' },
  gray: { border: 'border-l-border', icon: 'text-text-muted', text: 'text-text-muted' },
}

function KPICard({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sublabel: string
  accent: 'red' | 'orange' | 'green' | 'gray'
}) {
  const colors = ACCENT_COLORS[accent]
  return (
    <div className={cn(
      'p-4 rounded-lg border border-border border-l-4 bg-background-secondary',
      colors.border,
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">
          {label}
        </span>
        <span className={colors.icon}>{icon}</span>
      </div>
      <p className={cn('text-2xl font-bold', colors.text)}>{value}</p>
      {sublabel && <p className="text-xs text-text-muted mt-1">{sublabel}</p>}
    </div>
  )
}

export function ResolvedTodayCard({ count }: { count: number }) {
  return (
    <div className="p-4 rounded-lg border border-border border-l-4 border-l-accent-green bg-background-secondary">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={20} className="text-accent-green" />
        <div>
          <p className="text-sm text-text-muted">Resolvidos (24h)</p>
          <p className="text-2xl font-bold text-accent-green">{count}</p>
        </div>
      </div>
    </div>
  )
}
