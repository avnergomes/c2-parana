// src/pages/ComandoPage.tsx
// Dashboard executivo do comandante (Fase 4.F)
import { Radar, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommandDashboard, useUrgentIncidents } from '@/hooks/useCommandDashboard'
import { useRelatorios } from '@/hooks/useRelatorios'
import { CommandKPICards, ResolvedTodayCard } from '@/components/command/CommandKPICards'
import { UrgentIncidentsList } from '@/components/command/UrgentIncidentsList'
import { IncidentMetricsCharts } from '@/components/command/IncidentMetricsCharts'

export function ComandoPage() {
  const { data: kpis } = useCommandDashboard()
  const { data: urgent, isLoading: urgentLoading } = useUrgentIncidents(5)
  const { data: reports } = useRelatorios()
  const latestReport = reports?.[0]

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Radar size={24} />
            Dashboard de Comando
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Visao executiva do C4ISR — KPIs operacionais e incidentes criticos
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <CommandKPICards kpis={kpis} />

      {/* Resolved today + recent report card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ResolvedTodayCard count={kpis?.resolvedLast24h ?? 0} />
        {latestReport && (
          <Link
            to="/relatorios"
            className="md:col-span-2 p-4 rounded-lg border border-border bg-background-secondary hover:bg-background-elevated transition-colors flex items-start gap-3"
          >
            <FileText size={20} className="text-accent-green flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted uppercase tracking-wider">
                Ultimo Relatorio Situacional
              </p>
              <p className="text-sm font-semibold text-text-primary mt-0.5">
                {new Date(latestReport.report_date).toLocaleDateString('pt-BR')}
              </p>
              <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                {latestReport.executive_summary}
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* Main grid: urgent incidents + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Urgent incidents (2/5 width) */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Incidentes Urgentes
          </h3>
          <UrgentIncidentsList incidents={urgent} isLoading={urgentLoading} />
        </div>

        {/* Charts (3/5 width) */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Metricas Operacionais
          </h3>
          <IncidentMetricsCharts days={30} />
        </div>
      </div>
    </div>
  )
}
