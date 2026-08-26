// supabase/functions/etl-dengue/index.ts
// Projecao de casos de dengue por regressao linear simples (Fase 3.C).
//
// Porte Deno de scripts/etl_dengue_projections.py (a especificacao). DB->DB:
// para cada municipio com >= 4 semanas em dengue_data, regressao linear sobre
// as ultimas 8 semanas e projecao das proximas 4. Full refresh de
// dengue_projections (delete calculated_at < now + upsert).
//
// O historico deste pipeline exige atencao: a versao Python ficou 108 dias
// sem gravar por uma cadeia de 3 defeitos (URL-encoding do delete, upsert sem
// merge-duplicates, log de sucesso incondicional). Aqui o delete e o upsert
// passam pelo supabase-js (sem interpolacao de URL) e qualquer erro derruba o
// run com status=error.

import { runEtl, batchUpsert, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const MIN_WEEKS = 4
const BASELINE_WEEKS = 8
const PROJECTION_WEEKS = 4

interface DengueRow {
  ibge_code: string
  municipality_name: string | null
  epidemiological_week: number
  year: number
  cases: number | null
}

interface Projection {
  ibge_code: string
  municipality: string
  projected_week: number
  projected_year: number
  projected_cases: number
  trend: string
  slope: number
  r_squared: number
  baseline_weeks: number
  calculated_at: string
  [key: string]: unknown
}

/** Regressao linear simples: retorna [slope, intercept, r2 (clampado em 0)]. */
function linearRegression(x: number[], y: number[]): [number, number, number] {
  const n = x.length
  if (n < 2) return [0, 0, 0]

  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-10) return [0, sumY / n, 0]

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const ssRes = x.reduce((acc, xi, i) => acc + (y[i] - (slope * xi + intercept)) ** 2, 0)
  const meanY = sumY / n
  const ssTot = y.reduce((acc, yi) => acc + (yi - meanY) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return [slope, intercept, Math.max(0, r2)]
}

/** Avanca a semana epidemiologica em `offset` semanas (52 semanas/ano). */
function nextEpiWeek(year: number, week: number, offset: number): [number, number] {
  let w = week + offset
  let y = year
  while (w > 52) {
    w -= 52
    y += 1
  }
  return [y, w]
}

const round = (v: number, places: number) => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

async function fetchAllDengue(client: SupabaseClient): Promise<DengueRow[]> {
  const rows: DengueRow[] = []
  const pageSize = 1000
  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from('dengue_data')
      .select('ibge_code,municipality_name,epidemiological_week,year,cases')
      .order('year', { ascending: true })
      .order('epidemiological_week', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) throw new Error(`dengue_data page ${page}: ${error.message}`)
    const batch = (data ?? []) as DengueRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

Deno.serve((req: Request) =>
  runEtl(req, 'dengue', async (client: SupabaseClient): Promise<RunResult> => {
    const rows = await fetchAllDengue(client)
    if (rows.length === 0) {
      return { status: 'empty', reason: 'dengue_data vazio', projections: 0 }
    }

    const byMuni = new Map<string, DengueRow[]>()
    for (const r of rows) {
      if (!r.ibge_code) continue
      const list = byMuni.get(r.ibge_code) ?? []
      list.push(r)
      byMuni.set(r.ibge_code, list)
    }

    const nowIso = new Date().toISOString()
    const projections: Projection[] = []
    let trendAlta = 0

    for (const [ibgeCode, muniRows] of byMuni) {
      // Dedup por (year, week) preservando a primeira ocorrencia, depois ordena
      const seen = new Set<string>()
      const weekly: DengueRow[] = []
      for (const r of muniRows) {
        const key = `${r.year}:${r.epidemiological_week}`
        if (!seen.has(key)) {
          seen.add(key)
          weekly.push(r)
        }
      }
      weekly.sort((a, b) => a.year - b.year || a.epidemiological_week - b.epidemiological_week)

      const recent = weekly.slice(-BASELINE_WEEKS)
      if (recent.length < MIN_WEEKS) continue

      const municipality = recent[recent.length - 1].municipality_name ?? ''
      const x = recent.map((_, i) => i)
      const y = recent.map((r) => Number(r.cases ?? 0))

      const [slope, intercept, r2] = linearRegression(x, y)

      let trend: string
      if (slope > 1 && r2 > 0.3) {
        trend = 'alta'
        trendAlta++
      } else if (slope < -1 && r2 > 0.3) {
        trend = 'queda'
      } else {
        trend = 'estavel'
      }

      const last = recent[recent.length - 1]
      const n = recent.length
      for (let offset = 1; offset <= PROJECTION_WEEKS; offset++) {
        const [projYear, projWeek] = nextEpiWeek(last.year, last.epidemiological_week, offset)
        const projectedCases = Math.max(0, slope * (n - 1 + offset) + intercept)
        projections.push({
          ibge_code: ibgeCode,
          municipality,
          projected_week: projWeek,
          projected_year: projYear,
          projected_cases: round(projectedCases, 1),
          trend,
          slope: round(slope, 3),
          r_squared: round(r2, 3),
          baseline_weeks: n,
          calculated_at: nowIso,
        })
      }
    }

    if (projections.length === 0) {
      return { status: 'empty', reason: 'nenhum municipio com semanas suficientes', projections: 0 }
    }

    // Full refresh: remove projecoes anteriores a este run.
    const { error: delError } = await client
      .from('dengue_projections')
      .delete()
      .lt('calculated_at', nowIso)
    if (delError) throw new Error(`delete dengue_projections: ${delError.message}`)

    const result = await batchUpsert(
      client,
      'dengue_projections',
      projections,
      'ibge_code,projected_week,projected_year',
      200,
    )
    if (result.errors > 0 && result.inserted === 0) {
      throw new Error(`upsert dengue_projections: ${result.errors} linhas falharam`)
    }

    return {
      status: result.errors > 0 ? 'partial' : 'success',
      municipalities: byMuni.size,
      projections: result.inserted,
      failed_rows: result.errors,
      trend_alta: trendAlta,
    }
  })
)
