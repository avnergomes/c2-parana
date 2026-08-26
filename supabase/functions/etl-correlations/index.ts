// supabase/functions/etl-correlations/index.ts
// Motor de fusao de dados multi-dominio (Fase 3.A).
//
// Porte Deno de scripts/etl_correlations.py (a especificacao). Avalia regras
// compostas (alert_rules.domain='composto') cruzando climate_data, fire_spots,
// river_levels, dengue_data, air_quality e irtc_scores por municipio. Regra
// disparada => fan-out de notifications (uma por usuario em profiles) +
// auto-criacao de incidente quando a regra pede.
//
// Municipios: o Python lia public/data/municipios-pr.geojson; aqui a lista
// viaja no bundle via _shared/pr_municipios.ts (mesmos 399 nomes/codigos).
//
// Divergencia deliberada (mesma do etl-alerts, divergencia c): a criacao de
// incidente e um INSERT simples com tratamento de 23505, porque
// idx_incidents_dedup e um indice unico PARCIAL e ON CONFLICT via PostgREST
// nao infere indice parcial -- o "upsert" do Python respondia 400 e nunca
// criava incidente. O INSERT + 23505 realiza a dedup que o indice ja garante.

import { runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { PR_MUNICIPIOS, buildNameLookup, stripAccentsLower } from '../_shared/pr_municipios.ts'

interface Rule {
  id: string
  name: string
  description: string | null
  severity: string
  condition: {
    type?: string
    logic?: string
    clauses?: { field?: string; op?: string; value?: unknown }[]
  } | null
  cooldown_minutes: number | null
  auto_create_incident: boolean | null
}

interface MunicipalityContext {
  climate: { max_temp: number | null; min_humidity: number | null } | undefined
  fire_count: number
  river_level: string
  dengue_level: number
  irtc_score: number
  aqi: number | undefined
}

const utcIsoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function matchNameToIbge(name: string, lookup: Map<string, string>): string | null {
  if (!name) return null
  return lookup.get(name.toLowerCase().trim()) ?? lookup.get(stripAccentsLower(name)) ?? null
}

// --- Loaders --------------------------------------------------------------

async function loadCompositeRules(client: SupabaseClient): Promise<Rule[]> {
  const { data, error } = await client
    .from('alert_rules')
    .select('id,name,description,severity,condition,cooldown_minutes,auto_create_incident')
    .eq('domain', 'composto')
    .eq('is_active', true)
  if (error) throw new Error(`alert_rules: ${error.message}`)
  return (data ?? []) as Rule[]
}

async function loadUsers(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('profiles').select('id').limit(1000)
  if (error) throw new Error(`profiles: ${error.message}`)
  return ((data ?? []) as { id: string | null }[])
    .map((u) => u.id)
    .filter((id): id is string => Boolean(id))
}

async function fetchRecentClimate(
  client: SupabaseClient,
  windowHours: number,
): Promise<Map<string, { max_temp: number | null; min_humidity: number | null }>> {
  const cutoff = utcIsoZ(new Date(Date.now() - windowHours * 3600_000))
  const { data, error } = await client
    .from('climate_data')
    .select('ibge_code,temperature,humidity,observed_at')
    .gte('observed_at', cutoff)
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (error) {
    console.warn(`climate_data: ${error.message}`)
    return new Map()
  }
  const agg = new Map<string, { max_temp: number | null; min_humidity: number | null }>()
  for (const r of (data ?? []) as {
    ibge_code: string | null
    temperature: number | null
    humidity: number | null
  }[]) {
    if (!r.ibge_code) continue
    const cur = agg.get(r.ibge_code) ?? { max_temp: null, min_humidity: null }
    if (r.temperature !== null && (cur.max_temp === null || r.temperature > cur.max_temp)) {
      cur.max_temp = r.temperature
    }
    if (r.humidity !== null && (cur.min_humidity === null || r.humidity < cur.min_humidity)) {
      cur.min_humidity = r.humidity
    }
    agg.set(r.ibge_code, cur)
  }
  return agg
}

async function fetchRecentFireCounts(
  client: SupabaseClient,
  windowHours: number,
  lookup: Map<string, string>,
): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString().slice(0, 10)
  const { data, error } = await client
    .from('fire_spots')
    .select('municipality,acq_date')
    .gte('acq_date', cutoff)
  if (error) {
    console.warn(`fire_spots: ${error.message}`)
    return new Map()
  }
  const counts = new Map<string, number>()
  let unmatched = 0
  for (const r of (data ?? []) as { municipality: string | null }[]) {
    if (!r.municipality) continue
    const ibge = matchNameToIbge(r.municipality, lookup)
    if (ibge) counts.set(ibge, (counts.get(ibge) ?? 0) + 1)
    else unmatched++
  }
  if (unmatched > 0) console.warn(`fire_spots: ${unmatched} focos sem municipio reconciliado`)
  return counts
}

async function fetchRiverAlerts(
  client: SupabaseClient,
  lookup: Map<string, string>,
): Promise<Map<string, string>> {
  const { data, error } = await client.from('river_levels').select('municipality,alert_level')
  if (error) {
    console.warn(`river_levels: ${error.message}`)
    return new Map()
  }
  const priority: Record<string, number> = { normal: 0, attention: 1, alert: 2, emergency: 3 }
  const byIbge = new Map<string, string>()
  for (const r of (data ?? []) as { municipality: string | null; alert_level: string | null }[]) {
    if (!r.municipality) continue
    const level = r.alert_level ?? 'normal'
    const ibge = matchNameToIbge(r.municipality, lookup)
    if (!ibge) continue
    const existing = byIbge.get(ibge)
    if (existing === undefined || (priority[level] ?? 0) > (priority[existing] ?? 0)) {
      byIbge.set(ibge, level)
    }
  }
  return byIbge
}

async function fetchDengueLatest(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('dengue_data')
    .select('ibge_code,alert_level,year,epidemiological_week')
    .order('year', { ascending: false })
    .order('epidemiological_week', { ascending: false })
    .limit(2000)
  if (error) {
    console.warn(`dengue_data: ${error.message}`)
    return new Map()
  }
  const byIbge = new Map<string, number>()
  for (const r of (data ?? []) as { ibge_code: string | null; alert_level: number | null }[]) {
    if (r.ibge_code && !byIbge.has(r.ibge_code)) {
      byIbge.set(r.ibge_code, Number(r.alert_level ?? 0))
    }
  }
  return byIbge
}

async function fetchIrtcScores(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client.from('irtc_scores').select('ibge_code,irtc_score')
  if (error) {
    console.warn(`irtc_scores: ${error.message}`)
    return new Map()
  }
  const map = new Map<string, number>()
  for (const r of (data ?? []) as { ibge_code: string | null; irtc_score: number | null }[]) {
    if (r.ibge_code) map.set(r.ibge_code, Number(r.irtc_score ?? 0))
  }
  return map
}

async function fetchAirQualityByIbge(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client.from('air_quality').select('city,aqi')
  if (error) {
    console.warn(`air_quality: ${error.message}`)
    return new Map()
  }
  const cityToIbge: Record<string, string> = {
    curitiba: '4106902',
    londrina: '4113700',
    maringa: '4115200',
    foz: '4108304',
  }
  const byIbge = new Map<string, number>()
  for (const r of (data ?? []) as { city: string | null; aqi: number | null }[]) {
    const ibge = cityToIbge[(r.city ?? '').toLowerCase()]
    if (ibge && r.aqi !== null && r.aqi !== undefined) byIbge.set(ibge, Math.trunc(r.aqi))
  }
  return byIbge
}

// --- Avaliacao de regras --------------------------------------------------

function resolveField(field: string, ctx: MunicipalityContext): unknown {
  if (field === 'climate.temperature') return ctx.climate?.max_temp ?? null
  if (field === 'climate.humidity') return ctx.climate?.min_humidity ?? null
  if (field === 'fire_spots.count') return ctx.fire_count
  if (field === 'river.alert_level') return ctx.river_level
  if (field === 'dengue.alert_level') return ctx.dengue_level
  if (field === 'irtc.score') return ctx.irtc_score
  if (field === 'air.aqi') return ctx.aqi ?? null
  return null
}

function evalClause(
  clause: { field?: string; op?: string; value?: unknown },
  ctx: MunicipalityContext,
): boolean {
  const actual = resolveField(clause.field ?? '', ctx)
  if (actual === null || actual === undefined) return false
  const value = clause.value
  switch (clause.op ?? '=') {
    case '>':
      return (actual as number) > (value as number)
    case '>=':
      return (actual as number) >= (value as number)
    case '<':
      return (actual as number) < (value as number)
    case '<=':
      return (actual as number) <= (value as number)
    case '=':
      return actual === value
    case '!=':
      return actual !== value
    case 'in':
      return Array.isArray(value) && value.includes(actual)
    default:
      return false
  }
}

function evalRule(rule: Rule, ctx: MunicipalityContext): boolean {
  const condition = rule.condition ?? {}
  if (condition.type !== 'composite') return false
  const clauses = condition.clauses ?? []
  if (clauses.length === 0) return false
  const results = clauses.map((c) => evalClause(c, ctx))
  return (condition.logic ?? 'AND') === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

// --- Cooldown, corpo e incidente ------------------------------------------

async function recentlyFired(
  client: SupabaseClient,
  ruleId: string,
  ibgeCode: string,
  cooldownMinutes: number,
): Promise<boolean> {
  const cutoff = utcIsoZ(new Date(Date.now() - cooldownMinutes * 60_000))
  const { data, error } = await client
    .from('notifications')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('metadata->>ibge_code', ibgeCode)
    .gte('sent_at', cutoff)
    .limit(1)
  if (error) {
    console.warn(`cooldown ${ruleId}/${ibgeCode}: ${error.message}`)
    return false
  }
  return (data ?? []).length > 0
}

function buildBody(munName: string, ctx: MunicipalityContext): string {
  const parts: string[] = []
  if (ctx.climate?.max_temp !== null && ctx.climate?.max_temp !== undefined) {
    parts.push(`Temp max: ${ctx.climate.max_temp.toFixed(1)}°C`)
  }
  if (ctx.climate?.min_humidity !== null && ctx.climate?.min_humidity !== undefined) {
    parts.push(`Umidade min: ${ctx.climate.min_humidity.toFixed(0)}%`)
  }
  if (ctx.fire_count > 0) parts.push(`Focos 24h: ${ctx.fire_count}`)
  if (ctx.river_level && ctx.river_level !== 'normal') parts.push(`Rio: ${ctx.river_level}`)
  if (ctx.dengue_level > 0) parts.push(`Dengue nivel: ${ctx.dengue_level}`)
  if (ctx.irtc_score > 0) parts.push(`IRTC: ${ctx.irtc_score.toFixed(1)}`)
  if (ctx.aqi !== undefined) parts.push(`AQI: ${ctx.aqi}`)
  const details = parts.join(' | ')
  return `Correlacao detectada em ${munName}. ${details}`.trim()
}

const INCIDENT_TYPE_KEYWORDS: [string, string][] = [
  ['incendio', 'incendio'],
  ['incêndio', 'incendio'],
  ['fogo', 'incendio'],
  ['enchente', 'enchente'],
  ['hidrico', 'enchente'],
  ['hídrico', 'enchente'],
  ['inundacao', 'enchente'],
  ['inundação', 'enchente'],
  ['dengue', 'surto'],
  ['sanitario', 'surto'],
  ['sanitário', 'surto'],
  ['epidem', 'surto'],
  ['calor', 'onda_calor'],
  ['seca', 'seca'],
  ['ar', 'qualidade_ar'],
  ['irtc', 'outro'],
]

function inferIncidentType(ruleName: string): string {
  const lower = ruleName.toLowerCase()
  for (const [keyword, type] of INCIDENT_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return type
  }
  return 'outro'
}

async function maybeCreateIncident(
  client: SupabaseClient,
  rule: Rule,
  munName: string,
  ibgeCode: string,
  ctx: MunicipalityContext,
): Promise<boolean> {
  if (!rule.auto_create_incident) return false

  const incident = {
    title: `${rule.name} — ${munName}`,
    description: buildBody(munName, ctx),
    type: inferIncidentType(rule.name),
    severity: rule.severity,
    source_alert_id: rule.id,
    affected_municipalities: [{ ibge_code: ibgeCode, name: munName }],
    context: {
      climate: ctx.climate ?? null,
      fire_count: ctx.fire_count,
      river_level: ctx.river_level,
      dengue_level: ctx.dengue_level,
      irtc_score: ctx.irtc_score,
      aqi: ctx.aqi ?? null,
      detected_by: 'etl_correlations',
    },
  }

  const { error } = await client.from('incidents').insert(incident)
  if (!error) return true
  if (error.code === '23505') return false // dedup pelo indice parcial: ja ha incidente aberto
  console.warn(`incidents ${rule.id}/${ibgeCode}: ${error.message}`)
  return false
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'correlations', async (client: SupabaseClient): Promise<RunResult> => {
    const rules = await loadCompositeRules(client)
    if (rules.length === 0) {
      return { status: 'empty', reason: 'nenhuma regra composta ativa' }
    }

    const lookup = buildNameLookup()
    const userIds = await loadUsers(client)

    const climateAgg = await fetchRecentClimate(client, 6)
    const fireCounts = await fetchRecentFireCounts(client, 24, lookup)
    const riverAlerts = await fetchRiverAlerts(client, lookup)
    const dengueLevels = await fetchDengueLatest(client)
    const irtcScores = await fetchIrtcScores(client)
    const airByIbge = await fetchAirQualityByIbge(client)

    const notifications: Record<string, unknown>[] = []
    let fired = 0
    let cooldownSkipped = 0
    let incidentsCreated = 0

    for (const [ibgeCode, munName] of PR_MUNICIPIOS) {
      const ctx: MunicipalityContext = {
        climate: climateAgg.get(ibgeCode),
        fire_count: fireCounts.get(ibgeCode) ?? 0,
        river_level: riverAlerts.get(ibgeCode) ?? 'normal',
        dengue_level: dengueLevels.get(ibgeCode) ?? 0,
        irtc_score: irtcScores.get(ibgeCode) ?? 0,
        aqi: airByIbge.get(ibgeCode),
      }

      for (const rule of rules) {
        if (!evalRule(rule, ctx)) continue

        const cooldown = Math.trunc(rule.cooldown_minutes ?? 60)
        if (await recentlyFired(client, rule.id, ibgeCode, cooldown)) {
          cooldownSkipped++
          continue
        }

        fired++
        if (await maybeCreateIncident(client, rule, munName, ibgeCode, ctx)) {
          incidentsCreated++
        }

        for (const uid of userIds) {
          notifications.push({
            rule_id: rule.id,
            user_id: uid,
            channel: 'push',
            title: `${rule.name} — ${munName}`,
            body: buildBody(munName, ctx),
            severity: rule.severity,
            metadata: {
              domain: 'composto',
              ibge_code: ibgeCode,
              municipality: munName,
              source: 'etl_correlations',
              rule_name: rule.name,
              context_snapshot: {
                fire_count: ctx.fire_count,
                river_level: ctx.river_level,
                dengue_level: ctx.dengue_level,
                irtc_score: ctx.irtc_score,
                aqi: ctx.aqi ?? null,
              },
            },
          })
        }
      }
    }

    let insertFailed = false
    if (notifications.length > 0) {
      for (let i = 0; i < notifications.length; i += 200) {
        const { error } = await client
          .from('notifications')
          .insert(notifications.slice(i, i + 200))
        if (error) {
          console.error(`notifications lote ${i}: ${error.message}`)
          insertFailed = true
          break
        }
      }
    }

    return {
      status: insertFailed ? 'partial' : 'success',
      rules_active: rules.length,
      municipalities_evaluated: PR_MUNICIPIOS.length,
      rules_fired: fired,
      cooldown_skipped: cooldownSkipped,
      notifications_inserted: insertFailed ? 0 : notifications.length,
      incidents_created: incidentsCreated,
      sources: {
        clima: climateAgg.size,
        focos: fireCounts.size,
        rios: riverAlerts.size,
        dengue: dengueLevels.size,
        irtc: irtcScores.size,
        ar: airByIbge.size,
      },
    }
  })
)
