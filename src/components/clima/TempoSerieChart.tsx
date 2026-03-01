// src/components/clima/TempoSerieChart.tsx
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useHistoricoClima } from '@/hooks/useClima'
import { Skeleton } from '@/components/ui/SkeletonCard'

interface TempoSerieChartProps {
  stationCode: string
  stationName: string
}

export function TempoSerieChart({ stationCode, stationName }: TempoSerieChartProps) {
  const { data, isLoading } = useHistoricoClima(stationCode, 7)

  if (isLoading) return <Skeleton className="h-40 w-full" />

  const chartData = (data || []).map(d => ({
    time: format(new Date(d.observed_at), 'dd/MM HH:mm', { locale: ptBR }),
    temp: d.temperature,
    hum: d.humidity,
    prec: d.precipitation,
  }))

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3">Temperatura — {stationName} (7 dias)</p>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            itemStyle={{ color: '#f9fafb', fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="temp"
            name="Temp (°C)"
            stroke="#3b82f6"
            fill="url(#tempGrad)"
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
