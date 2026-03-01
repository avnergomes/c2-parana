// src/components/ambiente/FireTrendChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useFireTrend } from '@/hooks/useAmbiente'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function FireTrendChart() {
  const { data, isLoading } = useFireTrend(30)

  if (isLoading) return <div className="h-40 bg-background-elevated rounded animate-pulse" />

  const chartData = (data || []).map(d => ({
    date: format(new Date(d.date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
    focos: d.count,
  }))

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">
        Focos de Calor — PR (últimos 30 dias)
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} interval={4} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            formatter={(v: number) => [v, 'Focos']}
          />
          <Bar dataKey="focos" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
