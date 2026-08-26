// supabase/functions/etl-situational/index.ts
// Relatorio situacional diario do Parana (Fase 3.B).
//
// Porte Deno de scripts/etl_situational_report.py (a especificacao). DB->DB:
// consolida clima, dengue, incendios, rios, IRTC e alertas num resumo
// executivo narrativo + recomendacoes. Upsert em situational_reports por
// report_date (idempotente). report_date e o dia em BRT (UTC-3), como no
// Python. Falha em uma fonte nao derruba o relatorio: entra na lista de
// erros anexada as recomendacoes.
//
// Igual ao Python, as consultas sem .limit() ficam no teto default de 1000
// linhas do PostgREST -- mesma janela efetiva de dados nos dois runtimes.

import { runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const round1 = (v: number) => Math.round(v * 10) / 10

/** Agora em BRT (UTC-3). */
function nowBrt(): Date {
  return new Date(Date.now() - 3 * 3600_000)
}

interface IrtcRow {
  municipality: string | null
  ibge_code: string | null
  irtc_score: number | null
  risk_level: string | null
  dominant_domain: string | null
  data_coverage: number | null
}

async function fetchIrtcTop(client: SupabaseClient, n: number): Promise<IrtcRow[]> {
  const { data, error } = await client
    .from('irtc_scores')
    .select(
      'municipality,ibge_code,irtc_score,risk_level,dominant_domain,data_coverage,risk_clima,risk_saude,risk_ambiente,risk_hidro,risk_ar',
    )
    .order('irtc_score', { ascending: false })
    .limit(n)
  if (error) throw new Error(`irtc_scores top: ${error.message}`)
  return (data ?? []) as IrtcRow[]
}

async function fetchIrtcDistribution(client: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await client.from('irtc_scores').select('risk_level')
  if (error) throw new Error(`irtc_scores dist: ${error.message}`)
  const dist: Record<string, number> = { baixo: 0, medio: 0, alto: 0, critico: 0 }
  for (const row of (data ?? []) as { risk_level: string | null }[]) {
    const level = (row.risk_level ?? 'baixo').replaceAll('é', 'e').replaceAll('í', 'i')
    dist[level] = (dist[level] ?? 0) + 1
  }
  return dist
}

async function fetchActiveAlerts(
  client: SupabaseClient,
): Promise<{ count: number; bySev: Record<string, number> }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await client
    .from('notifications')
    .select('id,severity')
    .gte('sent_at', since)
  if (error) throw new Error(`notifications: ${error.message}`)
  const rows = (data ?? []) as { severity: string | null }[]
  const bySev: Record<string, number> = {}
  for (const r of rows) {
    const s = r.severity ?? 'low'
    bySev[s] = (bySev[s] ?? 0) + 1
  }
  return { count: rows.length, bySev }
}

async function fetchDengueSummary(client: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: latest, error: latestErr } = await client
    .from('dengue_data')
    .select('year,epidemiological_week')
    .order('year', { ascending: false })
    .order('epidemiological_week', { ascending: false })
    .limit(1)
  if (latestErr) throw new Error(`dengue_data latest: ${latestErr.message}`)
  if (!latest || latest.length === 0) {
    return { week: '?', total_cases: 0, municipios_alerta: 0 }
  }
  const { year, epidemiological_week: week } = latest[0] as {
    year: number
    epidemiological_week: number
  }
  const { data, error } = await client
    .from('dengue_data')
    .select('cases,alert_level')
    .eq('year', year)
    .eq('epidemiological_week', week)
  if (error) throw new Error(`dengue_data week: ${error.message}`)
  const rows = (data ?? []) as { cases: number | null; alert_level: number | null }[]
  const total = rows.reduce((acc, r) => acc + (r.cases ?? 0), 0)
  const alerta = rows.filter((r) => (r.alert_level ?? 0) >= 3).length
  return {
    week: `SE ${week}/${year}`,
    total_cases: total,
    municipios_alerta: alerta,
    municipios_total: rows.length,
  }
}

async function fetchClimateSummary(client: SupabaseClient): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data, error } = await client
    .from('climate_data')
    .select('temperature,humidity')
    .gte('observed_at', since)
  if (error) throw new Error(`climate_data: ${error.message}`)
  const rows = (data ?? []) as { temperature: number | null; humidity: number | null }[]
  if (rows.length === 0) return { stations: 0, avg_temp: null, avg_humidity: null }
  const temps = rows.map((r) => r.temperature).filter((v): v is number => v !== null)
  const humids = rows.map((r) => r.humidity).filter((v): v is number => v !== null)
  return {
    stations: rows.length,
    avg_temp: temps.length ? round1(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
    max_temp: temps.length ? round1(Math.max(...temps)) : null,
    avg_humidity: humids.length
      ? round1(humids.reduce((a, b) => a + b, 0) / humids.length)
      : null,
  }
}

async function fetchFireSummary(client: SupabaseClient): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)
  const { data, error } = await client
    .from('fire_spots')
    .select('municipality')
    .gte('acq_date', since)
  if (error) throw new Error(`fire_spots: ${error.message}`)
  const rows = (data ?? []) as { municipality: string | null }[]
  const munis = new Set(rows.map((r) => r.municipality ?? ''))
  return { total_spots: rows.length, affected_municipalities: munis.size }
}

async function fetchRiverSummary(client: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await client.from('river_levels').select('municipality,alert_level')
  if (error) throw new Error(`river_levels: ${error.message}`)
  const rows = (data ?? []) as { alert_level: string | null }[]
  const byLevel: Record<string, number> = {}
  for (const r of rows) {
    const level = r.alert_level ?? 'normal'
    byLevel[level] = (byLevel[level] ?? 0) + 1
  }
  return { total_stations: rows.length, by_level: byLevel }
}

Deno.serve((req: Request) =>
  runEtl(req, 'situational', async (client: SupabaseClient): Promise<RunResult> => {
    const brt = nowBrt()
    const reportDate = brt.toISOString().slice(0, 10)
    const ddmmyyyy = `${reportDate.slice(8, 10)}/${reportDate.slice(5, 7)}/${reportDate.slice(0, 4)}`
    const errors: string[] = []

    let top10: IrtcRow[] = []
    let irtcDist: Record<string, number> = {}
    try {
      top10 = await fetchIrtcTop(client, 10)
      irtcDist = await fetchIrtcDistribution(client)
    } catch (e) {
      errors.push(`irtc: ${(e as Error).message}`)
    }

    let alertCount = 0
    let alertsBySev: Record<string, number> = {}
    try {
      const r = await fetchActiveAlerts(client)
      alertCount = r.count
      alertsBySev = r.bySev
    } catch (e) {
      errors.push(`alerts: ${(e as Error).message}`)
    }

    let dengue: Record<string, unknown> = { week: '?', total_cases: 0, municipios_alerta: 0 }
    try {
      dengue = await fetchDengueSummary(client)
    } catch (e) {
      errors.push(`dengue: ${(e as Error).message}`)
    }

    let clima: Record<string, unknown> = { stations: 0 }
    try {
      clima = await fetchClimateSummary(client)
    } catch (e) {
      errors.push(`clima: ${(e as Error).message}`)
    }

    let fire: Record<string, unknown> = { total_spots: 0, affected_municipalities: 0 }
    try {
      fire = await fetchFireSummary(client)
    } catch (e) {
      errors.push(`fire: ${(e as Error).message}`)
    }

    let river: Record<string, unknown> = { total_stations: 0, by_level: {} }
    try {
      river = await fetchRiverSummary(client)
    } catch (e) {
      errors.push(`river: ${(e as Error).message}`)
    }

    // Resumo executivo
    const altoCritico = (irtcDist['alto'] ?? 0) + (irtcDist['critico'] ?? 0)
    const parts = [`Relatorio Situacional do Parana - ${ddmmyyyy}.`]
    if (altoCritico > 0) parts.push(`${altoCritico} municipio(s) em risco ALTO ou CRITICO.`)

    const dengueAlerta = Number(dengue['municipios_alerta'] ?? 0)
    if (dengueAlerta > 0) {
      parts.push(
        `Dengue: ${dengue['total_cases']} casos na ${dengue['week']}, ` +
          `${dengueAlerta} municipio(s) em alerta laranja/vermelho.`,
      )
    } else {
      parts.push(`Dengue: ${dengue['total_cases'] ?? 0} casos na ${dengue['week'] ?? '?'}.`)
    }

    const totalSpots = Number(fire['total_spots'] ?? 0)
    if (totalSpots > 0) {
      parts.push(
        `Incendios: ${totalSpots} foco(s) em ${fire['affected_municipalities']} municipio(s) nas ultimas 24h.`,
      )
    }

    const maxTemp = clima['max_temp'] as number | null | undefined
    if (maxTemp && maxTemp > 35) {
      parts.push(`Alerta termico: temperatura maxima de ${maxTemp}C registrada.`)
    }

    if (alertCount > 0) parts.push(`${alertCount} alerta(s) ativo(s) nas ultimas 24h.`)

    const executiveSummary = parts.join(' ')

    const topRisks = top10.map((r) => ({
      municipality: r.municipality,
      ibge_code: r.ibge_code,
      irtc_score: r.irtc_score,
      risk_level: r.risk_level,
      dominant_domain: r.dominant_domain,
      data_coverage: r.data_coverage,
    }))

    const domainSummaries = {
      dengue,
      clima,
      incendios: fire,
      rios: river,
      irtc_distribuicao: irtcDist,
      alertas: { total_24h: alertCount, por_severidade: alertsBySev },
    }

    // Recomendacoes
    const recs: string[] = []
    if (altoCritico > 0) {
      const topMun = top10.length > 0 ? top10[0].municipality : '?'
      recs.push(
        `Priorizar monitoramento dos ${altoCritico} municipios em risco alto/critico. ` +
          `Municipio mais critico: ${topMun}.`,
      )
    }
    if (dengueAlerta > 5) {
      recs.push(
        'Dengue em expansao: acionar protocolo de vigilancia epidemiologica nos ' +
          `${dengueAlerta} municipios em alerta.`,
      )
    }
    if (totalSpots > 10) {
      recs.push(
        `Volume elevado de focos de incendio (${totalSpots}). ` +
          'Verificar condicoes meteorologicas e acionar Corpo de Bombeiros se necessario.',
      )
    }
    const byLevel = (river['by_level'] ?? {}) as Record<string, number>
    if ((byLevel['alert'] ?? 0) + (byLevel['emergency'] ?? 0) > 0) {
      recs.push(
        'Rios em nivel de alerta/emergencia detectados. ' +
          'Monitorar precipitacao acumulada e acionar Defesa Civil se necessario.',
      )
    }
    if (recs.length === 0) recs.push('Situacao geral estavel. Manter monitoramento padrao.')

    let recommendations = recs.map((r) => `- ${r}`).join('\n')
    if (errors.length > 0) {
      recommendations += `\n\n[AVISO: ${errors.length} erro(s) na coleta: ${errors.join(', ')}]`
    }

    const report = {
      report_date: reportDate,
      executive_summary: executiveSummary,
      active_alerts_count: alertCount,
      top_risks: topRisks,
      domain_summaries: domainSummaries,
      recommendations,
      generated_at: new Date().toISOString(),
    }

    const { error } = await client
      .from('situational_reports')
      .upsert(report, { onConflict: 'report_date' })
    if (error) throw new Error(`situational_reports upsert: ${error.message}`)

    return {
      status: errors.length > 0 ? 'partial' : 'success',
      report_date: reportDate,
      active_alerts: alertCount,
      top_risk: topRisks.length > 0 ? topRisks[0].municipality : null,
      collect_errors: errors.length,
    }
  })
)
