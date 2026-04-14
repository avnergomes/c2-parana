// src/components/command/IncidentMetricsCharts.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useIncidentMetrics } from '@/hooks/useCommandDashboard'
import { INCIDENT_TYPE_LABELS } from '@/types/incident'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
}

const TYPE_COLORS: Record<string, string> = {
  incendio: '#f97316',
  enchente: '#3b82f6',
  surto: '#10b981',
  seca: '#eab308',
  qualidade_ar: '#6b7280',
  onda_calor: '#f43f5e',
  deslizamento: '#a16207',
  outro: '#9ca3af',
}

export function IncidentMetricsCharts({ days = 30 }: { days?: number }) {
  const { data, isLoading } = useIncidentMetrics(days)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="p-6 rounded-lg border border-border bg-background-secondary text-center text-text-muted text-sm">
        Sem dados suficientes nos ultimos {days} dias
      </div>
    )
  }

  const typeData = Object.entries(data.byType).map(([type, count]) => ({
    type,
    label: INCIDENT_TYPE_LABELS[type as keyof typeof INCIDENT_TYPE_LABELS] || type,
    count,
  }))

  const resolutionData = (Object.entries(data.avgResolutionHours) as Array<[keyof typeof data.avgResolutionHours, number]>)
    .filter(([, hours]) => hours > 0)
    .map(([severity, hours]) => ({
      severity,
      hours: Number(hours.toFixed(1)),
    }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* By type */}
      <div className="p-4 rounded-lg border border-border bg-background-secondary">
        <h4 className="text-sm font-semibold text-text-primary mb-3">
          Incidentes por Tipo (ultimos {days} dias)
        </h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={typeData} layout="horizontal">
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a20',
                border: '1px solid #2a2a30',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: '#d1d5db' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {typeData.map((entry) => (
                <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#9ca3af'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By severity (avg resolution time) */}
      <div className="p-4 rounded-lg border border-border bg-background-secondary">
        <h4 className="text-sm font-semibold text-text-primary mb-3">
          Tempo Medio de Resolucao (horas)
        </h4>
        {resolutionData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-text-muted text-sm">
            Nenhum incidente resolvido ainda
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={resolutionData}>
              <XAxis
                dataKey="severity"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                label={{ value: 'horas', angle: -90, fontSize: 10, fill: '#9ca3af' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a20',
                  border: '1px solid #2a2a30',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#d1d5db' }}
              />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {resolutionData.map((entry) => (
                  <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || '#9ca3af'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-border bg-background-secondary">
      <div className="h-4 w-48 bg-background-elevated rounded mb-3 animate-pulse" />
      <div className="h-[200px] bg-background-elevated rounded animate-pulse" />
    </div>
  )
}
