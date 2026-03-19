// src/components/getec/GetecOverview.tsx
import { useState, useMemo } from 'react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { formatNumber } from '@/lib/utils'
import type { GetecKpis } from '@/types/getec'
import type { AtendimentoMap, TimelinePoint } from '@/hooks/useGetec'

type TimelineAgg = 'dia' | 'semana' | 'mes'

interface GetecOverviewProps {
  kpis: GetecKpis
  loading: boolean
  atendimentosMap?: AtendimentoMap | null
  timeline?: TimelinePoint[] | null
}

const STATUS_COLORS = ['#10b981', '#6b7280'] // green=ativo, gray=inativo
const GENERO_COLORS = ['#3b82f6', '#ec4899', '#8b5cf6'] // blue=M, pink=F, purple=outro

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-S${String(week).padStart(2, '0')}`
}

function aggregateTimeline(points: TimelinePoint[], agg: TimelineAgg): { label: string; produtores: number }[] {
  if (agg === 'dia') {
    return points.map(p => ({ label: p.date.slice(5), produtores: p.produtores }))
  }

  const buckets = new Map<string, number>()
  for (const p of points) {
    const key = agg === 'semana'
      ? getISOWeek(p.date)
      : p.date.slice(0, 7) // YYYY-MM
    buckets.set(key, (buckets.get(key) || 0) + p.produtores)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({ label: key, produtores: val }))
}

export function GetecOverview({ kpis, loading, atendimentosMap, timeline }: GetecOverviewProps) {
  const [timelineAgg, setTimelineAgg] = useState<TimelineAgg>('semana')

  const timelineData = useMemo(() => {
    if (!timeline?.length) return []
    return aggregateTimeline(timeline, timelineAgg)
  }, [timeline, timelineAgg])

  const atendTotals = atendimentosMap ? Object.values(atendimentosMap).reduce(
    (acc, v) => ({ dia: acc.dia + v.dia, total: acc.total + v.total, produtores: acc.produtores + v.produtores }),
    { dia: 0, total: 0, produtores: 0 }
  ) : null

  const barData = kpis?.top_municipios?.map(m => ({
    name: m.municipio,
    total: m.total,
    ativos: m.ativos,
  })) || []

  const statusData = kpis ? [
    { name: 'Ativos', value: kpis.clientes_ativos },
    { name: 'Inativos', value: kpis.clientes_inativos },
  ] : []

  const generoData = kpis ? [
    { name: 'Masculino', value: kpis.genero_masculino },
    { name: 'Feminino', value: kpis.genero_feminino },
    ...(kpis.genero_outro > 0 ? [{ name: 'Outro', value: kpis.genero_outro }] : []),
  ] : []

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ErrorBoundary>
          <KpiCard
            label="Total Clientes"
            value={kpis ? formatNumber(kpis.total_clientes) : '—'}
            subvalue={kpis ? `Ref. ${kpis.data_referencia}` : undefined}
            accentColor="green"
            loading={loading}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Clientes Ativos"
            value={kpis ? formatNumber(kpis.clientes_ativos) : '—'}
            subvalue={kpis ? `${kpis.taxa_atividade}% do total` : undefined}
            accentColor="green"
            loading={loading}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Taxa de Atividade"
            value={kpis ? `${kpis.taxa_atividade}%` : '—'}
            accentColor="blue"
            loading={loading}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Municípios Atendidos"
            value={kpis ? formatNumber(kpis.municipios_atendidos) : '—'}
            accentColor="blue"
            loading={loading}
          />
        </ErrorBoundary>
      </div>

      {/* Atendimentos KPIs */}
      {atendTotals && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <ErrorBoundary>
            <KpiCard
              label="Atendimentos Ontem"
              value={formatNumber(atendTotals.dia)}
              accentColor="yellow"
            />
          </ErrorBoundary>
          <ErrorBoundary>
            <KpiCard
              label="Atendimentos no Ano"
              value={formatNumber(atendTotals.total)}
              accentColor="yellow"
            />
          </ErrorBoundary>
          <ErrorBoundary>
            <KpiCard
              label="Produtores Atendidos"
              value={formatNumber(atendTotals.produtores)}
              accentColor="green"
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Timeline de atendimentos */}
      {timelineData.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">Atendimentos ao Longo do Ano</h3>
            <div className="flex gap-1">
              {([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTimelineAgg(val)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    timelineAgg === val
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradAtend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  interval={timelineAgg === 'dia' ? 6 : 0}
                  angle={timelineAgg === 'dia' ? -45 : 0}
                  textAnchor={timelineAgg === 'dia' ? 'end' : 'middle'}
                  height={timelineAgg === 'dia' ? 50 : 30}
                />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => formatNumber(v)} width={50} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f3f4f6', fontSize: 12 }}
                  formatter={(v: number) => [formatNumber(v), 'Produtores']}
                />
                <Area type="monotone" dataKey="produtores" stroke="#f59e0b" fill="url(#gradAtend)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-text-muted text-xs mt-2">
            Produtores com último atendimento em cada {timelineAgg === 'dia' ? 'dia' : timelineAgg === 'semana' ? 'semana' : 'mês'}
          </p>
        </div>
      )}

      {/* Bar chart: Top 15 */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Top 15 Municípios por Clientes</h3>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => formatNumber(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 11 }} width={95} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
                formatter={(v: number) => [formatNumber(v), '']}
              />
              <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} name="Total" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4">Gênero</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={generoData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {generoData.map((_, i) => (
                    <Cell key={i} fill={GENERO_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v: number) => [formatNumber(v), '']}
                />
                <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4">Status</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v: number) => [formatNumber(v), '']}
                />
                <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="text-text-muted text-xs">
        Fonte: IDR-Paraná / GETEC · Ref: {kpis?.data_referencia || '—'}
      </p>
    </div>
  )
}
