// src/hooks/useTimeRangeData.ts
// Fase 5.E — compara 2 janelas temporais sobre a mesma tabela
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TimeRange {
  label: string
  startIso: string
  endIso: string
}

export interface TimeRangeResult {
  windowA: { range: TimeRange; avg: number | null; count: number }
  windowB: { range: TimeRange; avg: number | null; count: number }
  delta: number | null
  deltaPct: number | null
}

interface Options {
  table: 'climate_data' | 'fire_spots' | 'dengue_data' | 'air_quality'
  metric: string
  dateField: string
  daysPerWindow?: number
  ibgeCode?: string | null
  aggregate?: 'avg' | 'count' | 'sum'
}

/** Gera as duas janelas (atual vs anterior) com mesma duração. */
export function buildTwoWindows(daysPerWindow: number): {
  current: TimeRange
  previous: TimeRange
} {
  const now = new Date()
  const spanMs = daysPerWindow * 24 * 60 * 60 * 1000
  const currentEnd = new Date(now)
  const currentStart = new Date(now.getTime() - spanMs)
  const previousEnd = new Date(currentStart)
  const previousStart = new Date(previousEnd.getTime() - spanMs)
  return {
    current: {
      label: `últimos ${daysPerWindow}d`,
      startIso: currentStart.toISOString(),
      endIso: currentEnd.toISOString(),
    },
    previous: {
      label: `${daysPerWindow * 2}d → ${daysPerWindow}d atrás`,
      startIso: previousStart.toISOString(),
      endIso: previousEnd.toISOString(),
    },
  }
}

async function fetchWindow(
  opts: Options,
  range: TimeRange
): Promise<{ avg: number | null; count: number }> {
  const { table, metric, dateField, ibgeCode, aggregate = 'avg' } = opts

  let query = supabase
    .from(table)
    .select(metric, { count: 'exact' })
    .gte(dateField, range.startIso)
    .lt(dateField, range.endIso)

  if (ibgeCode && (table === 'climate_data' || table === 'dengue_data')) {
    query = query.eq('ibge_code', ibgeCode)
  }

  const { data, count, error } = await query.limit(5000)
  if (error) throw error
  if (!data || data.length === 0) {
    return { avg: null, count: count ?? 0 }
  }

  const values: number[] = []
  for (const row of data as Array<Record<string, unknown>>) {
    const v = row[metric]
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
  }

  if (aggregate === 'count') {
    return { avg: values.length, count: count ?? values.length }
  }
  if (aggregate === 'sum') {
    return {
      avg: values.reduce((s, v) => s + v, 0),
      count: count ?? values.length,
    }
  }
  if (values.length === 0) {
    return { avg: null, count: count ?? 0 }
  }
  return {
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    count: count ?? values.length,
  }
}

export function useTimeRangeData(opts: Options) {
  const days = opts.daysPerWindow ?? 30
  return useQuery({
    queryKey: [
      'time-range',
      opts.table,
      opts.metric,
      opts.dateField,
      days,
      opts.ibgeCode ?? 'all',
      opts.aggregate ?? 'avg',
    ],
    queryFn: async (): Promise<TimeRangeResult> => {
      const { current, previous } = buildTwoWindows(days)
      const [a, b] = await Promise.all([
        fetchWindow(opts, current),
        fetchWindow(opts, previous),
      ])
      const delta =
        a.avg != null && b.avg != null ? a.avg - b.avg : null
      const deltaPct =
        a.avg != null && b.avg != null && b.avg !== 0
          ? ((a.avg - b.avg) / b.avg) * 100
          : null
      return {
        windowA: { range: current, avg: a.avg, count: a.count },
        windowB: { range: previous, avg: b.avg, count: b.count },
        delta,
        deltaPct,
      }
    },
    staleTime: 1000 * 60 * 30,
  })
}
