// src/components/saude/DengueProjecoes.tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { useDengueProjectionsSummary } from '@/hooks/useDengueProjections'

const TREND_CONFIG = {
  alta: { icon: TrendingUp, color: 'text-status-danger', bg: 'bg-status-danger/10', label: 'Alta' },
  estavel: { icon: Minus, color: 'text-text-muted', bg: 'bg-background-elevated', label: 'Estavel' },
  queda: { icon: TrendingDown, color: 'text-status-success', bg: 'bg-status-success/10', label: 'Queda' },
}

export function DengueProjecoes() {
  const { data: summary, isLoading } = useDengueProjectionsSummary()

  if (isLoading) {
    return <div className="card p-6 animate-pulse"><div className="h-48 bg-background-elevated rounded" /></div>
  }

  if (!summary) {
    return (
      <div className="card p-6 text-center text-text-muted text-sm">
        Projecoes de dengue ainda nao disponiveis. O ETL roda diariamente as 07:00 BRT.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Projected weekly totals chart */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Projecao Estadual (+4 semanas)
        </h3>
        {summary.weeklyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={summary.weeklyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number) => [`${val.toLocaleString('pt-BR')} casos`, 'Projecao']}
              />
              <Bar dataKey="casos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-text-muted text-center py-8">Sem dados de projecao</p>
        )}
        <p className="text-2xs text-text-muted mt-2">
          Regressao linear sobre {summary.totalMunicipios} municipios |
          Calculado em {new Date(summary.calculatedAt).toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Municipalities with upward trend */}
      {summary.emAlta.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-status-danger" />
            Municipios em tendencia de alta ({summary.emAlta.length})
          </h3>
          <div className="space-y-1.5">
            {summary.emAlta.slice(0, 10).map((p, i) => {
              const cfg = TREND_CONFIG[p.trend]
              const Icon = cfg.icon
              return (
                <div key={p.ibge_code} className="flex items-center gap-2 text-xs py-1">
                  <span className="text-text-muted w-4 text-right">{i + 1}.</span>
                  <span className={cn('p-0.5 rounded', cfg.bg)}>
                    <Icon size={12} className={cfg.color} />
                  </span>
                  <span className="text-text-primary font-medium flex-1">{p.municipality}</span>
                  <span className="text-text-muted font-mono">
                    +{p.slope.toFixed(1)} casos/sem
                  </span>
                  <span className={cn(
                    'font-mono text-2xs px-1.5 py-0.5 rounded',
                    p.r_squared >= 0.5 ? 'bg-status-danger/10 text-status-danger' : 'bg-background-elevated text-text-muted'
                  )}>
                    R2={p.r_squared.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
