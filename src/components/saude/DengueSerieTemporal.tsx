// src/components/saude/DengueSerieTemporal.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useDengueSerie } from '@/hooks/useSaude'

export function DengueSerieTemporal() {
  const { data: serie, isLoading } = useDengueSerie(undefined, 12)

  // Agrupar por semana
  const byWeek = serie?.reduce((acc, d) => {
    const key = `${d.year}-SE${String(d.epidemiological_week).padStart(2, '0')}`
    if (!acc[key]) acc[key] = { week: key, total: 0, municipios: 0 }
    acc[key].total += d.cases || 0
    acc[key].municipios += 1
    return acc
  }, {} as Record<string, { week: string; total: number; municipios: number }>)

  const chartData = Object.values(byWeek || {}).slice(-16)

  if (isLoading) return <div className="h-40 bg-background-elevated rounded animate-pulse" />

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">Casos de Dengue — PR (semanas epidemiológicas)</p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="dengueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="week" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} interval={2} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
          />
          <Area type="monotone" dataKey="total" name="Casos" stroke="#f59e0b" fill="url(#dengueGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
