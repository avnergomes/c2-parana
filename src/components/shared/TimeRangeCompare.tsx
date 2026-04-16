// src/components/shared/TimeRangeCompare.tsx
// Fase 5.E — card compacto comparando duas janelas temporais
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useTimeRangeData } from '@/hooks/useTimeRangeData'
import type { TimeRangeResult } from '@/hooks/useTimeRangeData'

interface Props {
  title: string
  unit?: string
  table: 'climate_data' | 'fire_spots' | 'dengue_data' | 'air_quality'
  metric: string
  dateField: string
  daysPerWindow?: number
  ibgeCode?: string | null
  aggregate?: 'avg' | 'count' | 'sum'
  /** `true` = delta positivo é ruim (ex. temperatura, focos); `false` = melhor quando sobe */
  higherIsWorse?: boolean
  format?: (v: number) => string
}

export function TimeRangeCompare({
  title,
  unit,
  table,
  metric,
  dateField,
  daysPerWindow = 30,
  ibgeCode,
  aggregate = 'avg',
  higherIsWorse = true,
  format,
}: Props) {
  const { data, isLoading, isError } = useTimeRangeData({
    table,
    metric,
    dateField,
    daysPerWindow,
    ibgeCode,
    aggregate,
  })

  if (isLoading) return <Skeleton title={title} />
  if (isError || !data) return <ErrorState title={title} />

  return <Rendered title={title} unit={unit} data={data} higherIsWorse={higherIsWorse} format={format} />
}

function Rendered({
  title,
  unit,
  data,
  higherIsWorse,
  format,
}: {
  title: string
  unit?: string
  data: TimeRangeResult
  higherIsWorse: boolean
  format?: (v: number) => string
}) {
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const delta = data.delta
  const deltaPct = data.deltaPct

  const sign: 'up' | 'down' | 'flat' =
    delta == null ? 'flat' : delta > 0.01 ? 'up' : delta < -0.01 ? 'down' : 'flat'

  const isBad =
    delta == null
      ? false
      : higherIsWorse
        ? delta > 0
        : delta < 0

  const color = sign === 'flat' ? '#94a3b8' : isBad ? '#ef4444' : '#10b981'
  const icon =
    sign === 'up'
      ? <TrendingUp size={14} />
      : sign === 'down'
        ? <TrendingDown size={14} />
        : <Minus size={14} />

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider">
          {title}
        </h4>
        <span
          className="inline-flex items-center gap-1 text-2xs font-semibold"
          style={{ color }}
        >
          {icon}
          {deltaPct != null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border/40 p-2">
          <p className="text-2xs text-text-muted">{data.windowA.range.label}</p>
          <p className="text-lg font-bold text-text-primary font-mono">
            {data.windowA.avg != null ? fmt(data.windowA.avg) : '—'}
            {unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
          </p>
          <p className="text-2xs text-text-muted">{data.windowA.count} obs</p>
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <p className="text-2xs text-text-muted">{data.windowB.range.label}</p>
          <p className="text-lg font-bold text-text-secondary font-mono">
            {data.windowB.avg != null ? fmt(data.windowB.avg) : '—'}
            {unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
          </p>
          <p className="text-2xs text-text-muted">{data.windowB.count} obs</p>
        </div>
      </div>
    </div>
  )
}

function Skeleton({ title }: { title: string }) {
  return (
    <div className="card p-4 space-y-2 animate-pulse">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 bg-background-elevated rounded" />
        <div className="h-16 bg-background-elevated rounded" />
      </div>
    </div>
  )
}

function ErrorState({ title }: { title: string }) {
  return (
    <div className="card p-4 space-y-1">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
        {title}
      </p>
      <p className="text-xs text-text-muted italic">
        Dados indisponíveis para o período.
      </p>
    </div>
  )
}
