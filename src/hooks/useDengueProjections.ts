// src/hooks/useDengueProjections.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DengueProjection {
  ibge_code: string
  municipality: string
  projected_week: number
  projected_year: number
  projected_cases: number
  trend: 'alta' | 'estavel' | 'queda'
  slope: number
  r_squared: number
  baseline_weeks: number
  calculated_at: string
}

export function useDengueProjections() {
  return useQuery({
    queryKey: ['dengue-projections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dengue_projections')
        .select('*')
        .order('projected_year', { ascending: true })
        .order('projected_week', { ascending: true })

      if (error) throw error
      return (data || []) as DengueProjection[]
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useDengueProjectionsSummary() {
  const { data, isLoading } = useDengueProjections()

  if (!data || data.length === 0) {
    return { data: null, isLoading }
  }

  // Group by municipality, take first projection per municipality
  const byMuni = new Map<string, DengueProjection>()
  for (const p of data) {
    if (!byMuni.has(p.ibge_code)) {
      byMuni.set(p.ibge_code, p)
    }
  }

  const all = Array.from(byMuni.values())
  const emAlta = all.filter(p => p.trend === 'alta').sort((a, b) => b.slope - a.slope)
  const emQueda = all.filter(p => p.trend === 'queda')
  const totalMunicipios = all.length

  // Get projected weeks for chart (aggregate cases across all municipalities)
  const weeklyTotals = new Map<string, number>()
  for (const p of data) {
    const key = `SE${String(p.projected_week).padStart(2, '0')}`
    weeklyTotals.set(key, (weeklyTotals.get(key) || 0) + p.projected_cases)
  }
  const weeklyChart = Array.from(weeklyTotals.entries())
    .map(([semana, casos]) => ({ semana, casos: Math.round(casos) }))
    .sort((a, b) => a.semana.localeCompare(b.semana))

  return {
    data: {
      totalMunicipios,
      emAlta,
      emQueda: emQueda.length,
      weeklyChart,
      calculatedAt: data[0]?.calculated_at || '',
    },
    isLoading,
  }
}
