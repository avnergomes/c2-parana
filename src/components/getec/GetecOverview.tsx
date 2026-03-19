// src/components/getec/GetecOverview.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { formatNumber } from '@/lib/utils'
import type { GetecKpis } from '@/types/getec'
import type { AtendimentoMap } from '@/hooks/useGetec'

interface GetecOverviewProps {
  kpis: GetecKpis
  loading: boolean
  atendimentosMap?: AtendimentoMap | null
}

const STATUS_COLORS = ['#10b981', '#6b7280'] // green=ativo, gray=inativo
const GENERO_COLORS = ['#3b82f6', '#ec4899', '#8b5cf6'] // blue=M, pink=F, purple=outro

export function GetecOverview({ kpis, loading, atendimentosMap }: GetecOverviewProps) {
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
              label="Atendimentos Hoje"
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
