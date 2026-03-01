// src/components/agro/SerieChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SerieChartProps {
  data: Array<{ ano_mes: string; value: number }>
  label: string
  color?: string
  formatValue?: (v: number) => string
}

export function SerieChart({ data, label, color = '#10b981', formatValue }: SerieChartProps) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data.slice(-24)} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="ano_mes" tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} interval={3} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false}
            tickFormatter={v => formatValue ? formatValue(v) : String(v)} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            itemStyle={{ color: '#f9fafb', fontSize: 12 }}
            formatter={(v: number) => [formatValue ? formatValue(v) : v, label]}
          />
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
