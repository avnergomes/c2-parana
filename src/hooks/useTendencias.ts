// src/hooks/useTendencias.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type ClimateRow = Database['public']['Tables']['climate_data']['Row']
type FireSpotRow = Database['public']['Tables']['fire_spots']['Row']
type DengueRow = Database['public']['Tables']['dengue_data']['Row']

interface IRTCRow {
  irtc_score: number
  risk_level: string
}

/** Temperature readings for the last N hours, aggregated hourly. */
export function useTemperaturaTrend(hours = 72) {
  return useQuery({
    queryKey: ['tendencias-temp', hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, observed_at')
        .gte('observed_at', since)
        .not('temperature', 'is', null)
        .order('observed_at', { ascending: true }) as { data: Pick<ClimateRow, 'temperature' | 'observed_at'>[] | null }

      if (!data || data.length === 0) return []

      // Aggregate by hour: average temperature across all stations
      const byHour: Record<string, { sum: number; count: number }> = {}
      for (const row of data) {
        const hour = (row.observed_at || '').slice(0, 13)
        const temp = row.temperature
        if (!hour || temp == null) continue
        if (!byHour[hour]) byHour[hour] = { sum: 0, count: 0 }
        byHour[hour].sum += temp
        byHour[hour].count += 1
      }

      return Object.entries(byHour).map(([hour, { sum, count }]) => ({
        hora: hour.slice(5, 13).replace('T', ' ') + 'h',
        temp: Math.round((sum / count) * 10) / 10,
      }))
    },
    staleTime: 1000 * 60 * 30,
  })
}

/** Fire spots per day for the last N days. */
export function useFocosTrend(days = 7) {
  return useQuery({
    queryKey: ['tendencias-focos', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('acq_date')
        .gte('acq_date', since)
        .order('acq_date', { ascending: true }) as { data: Pick<FireSpotRow, 'acq_date'>[] | null }

      const byDay: Record<string, number> = {}
      for (const row of (data || [])) {
        const day = row.acq_date
        if (day) byDay[day] = (byDay[day] || 0) + 1
      }

      // Fill missing days with zero
      const result = []
      const start = new Date(since)
      for (let i = 0; i <= days; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const key = d.toISOString().split('T')[0]
        result.push({ data: key.slice(5), focos: byDay[key] || 0 })
      }
      return result
    },
    staleTime: 1000 * 60 * 60,
  })
}

/** Dengue cases per epidemiological week (last N weeks, state-wide). */
export function useDengueTrend(semanas = 8) {
  return useQuery({
    queryKey: ['tendencias-dengue', semanas],
    queryFn: async () => {
      // Paginate: Supabase caps at 1000 rows, with 399 munis/week we need multiple pages
      const allRows: Pick<DengueRow, 'epidemiological_week' | 'year' | 'cases'>[] = []
      let offset = 0
      const pageSize = 1000

      while (true) {
        const { data } = await supabase
          .from('dengue_data')
          .select('epidemiological_week, year, cases')
          .order('year', { ascending: true })
          .order('epidemiological_week', { ascending: true })
          .range(offset, offset + pageSize - 1) as { data: Pick<DengueRow, 'epidemiological_week' | 'year' | 'cases'>[] | null }

        const rows = data || []
        allRows.push(...rows)
        if (rows.length < pageSize) break
        offset += pageSize
      }

      if (allRows.length === 0) return []

      // Aggregate by week. Chave interna mantem year-SE## para ordenacao
      // determinista (SE04/2025 < SE10/2026), mas gera label amigavel que
      // inclui o ano quando o range do grafico cruza anos (evita ilusao
      // de sequencia SE04 -> SE10 sem indicacao do gap de ano).
      const byWeek = new Map<string, { year: number; week: number; casos: number }>()
      for (const row of allRows) {
        const year = row.year
        const week = row.epidemiological_week
        const key = `${year}-SE${String(week).padStart(2, '0')}`
        const prev = byWeek.get(key)
        if (prev) prev.casos += row.cases || 0
        else byWeek.set(key, { year, week, casos: row.cases || 0 })
      }

      const entries = Array.from(byWeek.values())
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
        .slice(-semanas)

      const crossesYear = entries.length > 0 && entries[0].year !== entries[entries.length - 1].year
      return entries.map(e => ({
        semana: crossesYear
          ? `SE${String(e.week).padStart(2, '0')}/${String(e.year).slice(-2)}`
          : `SE${String(e.week).padStart(2, '0')}`,
        casos: e.casos,
      }))
    },
    staleTime: 1000 * 60 * 60,
  })
}

/** IRTC distribution across all 399 municipalities. */
export function useIRTCDistribuicao() {
  return useQuery({
    queryKey: ['tendencias-irtc'],
    queryFn: async () => {
      const { data } = await supabase
        .from('irtc_scores')
        .select('irtc_score, risk_level') as { data: Pick<IRTCRow, 'irtc_score' | 'risk_level'>[] | null }

      if (!data || data.length === 0) return { baixo: 0, medio: 0, alto: 0, critico: 0, total: 0, media: 0 }

      const dist = { baixo: 0, medio: 0, alto: 0, critico: 0 }
      let sum = 0
      for (const row of data) {
        const score = row.irtc_score || 0
        sum += score
        if (score < 25) dist.baixo++
        else if (score < 50) dist.medio++
        else if (score < 75) dist.alto++
        else dist.critico++
      }

      return { ...dist, total: data.length, media: Math.round((sum / data.length) * 10) / 10 }
    },
    staleTime: 1000 * 60 * 30,
  })
}
