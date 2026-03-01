// src/components/agro/Sparkline.tsx
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklineProps {
  data: Array<{ value: number; label?: string }>
  color?: string
  height?: number
}

export function Sparkline({ data, color = '#10b981', height = 40 }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-text-muted text-2xs">sem dados</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 4, padding: '4px 8px' }}
          itemStyle={{ color: '#f9fafb', fontSize: 11 }}
          labelStyle={{ display: 'none' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
