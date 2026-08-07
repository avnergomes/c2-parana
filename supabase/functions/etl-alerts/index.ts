// supabase/functions/etl-alerts/index.ts
// Motor de alertas: avalia alert_rules contra os dados de cada dominio e cria
// notificacoes (e, opcionalmente, incidentes).
//
// Porte Deno de scripts/etl_alerts_engine.py (a especificacao).
//
// Diferencas deliberadas em relacao ao Python, todas justificadas:
//
//  1. Fetch unico. O Python consultava profiles + notification_preferences a
//     cada regra disparada e notifications a cada regra atendida (N queries
//     por run). Aqui tudo isso e carregado uma vez e avaliado em memoria.
//     Com dezenas de regras a diferenca e de segundos, o que importa dentro do
//     wall-clock da Edge Function.
//
//  2. metadata como objeto. O Python fazia json.dumps(metadata) antes de
//     inserir numa coluna jsonb, o que grava uma *string* JSON em vez de um
//     objeto (metadata->>'domain' devolve null). Aqui vai o objeto. Divergencia
//     esperada na comparacao do passo 5 do checklist de cutover.
//
//  3. Criacao de incidente por insert + 23505. idx_incidents_dedup e um indice
//     unico PARCIAL (WHERE status NOT IN ('resolved','closed')); ON CONFLICT
//     nao consegue inferir indice parcial sem repetir o predicado, coisa que
//     PostgREST nao expressa. Insert simples tratando violacao de unicidade
//     como "ja existe" funciona corretamente com o indice parcial.

import { pooledMap, runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

const DOMAIN_TO_INCIDENT_TYPE: Record<string, string> = {
  clima: 'onda_calor',
  saude: 'surto',
  ambiente: 'incendio',
  hidro: 'enchente',
  ar: 'qualidade_ar',
  composto: 'outro',
}

type DataRecord = Record<string, unknown>

interface Condition {
  field?: string
  operator?: string
  threshold?: unknown
}

interface AlertRule {
  id: string
  name: string
  description: string | null
  domain: string
  condition: Condition | string
  severity: string
  channels: string[] | null
  cooldown_minutes: number | null
  auto_create_incident: boolean | null
}

interface UserPrefs {
  user_id: string
  min_severity: string | null
  push_enabled: boolean | null
  email_enabled: boolean | null
  telegram_enabled: boolean | null
}

// ---------------------------------------------------------------------------
// Fetchers por dominio
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type QueryBuilder = any

/**
 * SELECT que degrada em lista vazia no lugar de lancar.
 *
 * Deliberado: uma tabela de dominio indisponivel deve pular as regras daquele
 * dominio, nao derrubar a avaliacao dos outros cinco (o Python fazia o mesmo).
 */
async function selectAll(
  client: SupabaseClient,
  table: string,
  columns: string,
  build?: (q: QueryBuilder) => QueryBuilder,
): Promise<DataRecord[]> {
  let query: QueryBuilder = client.from(table).select(columns)
  if (build) query = build(query)
  const { data, error } = await query
  if (error) {
    console.warn(`select ${table}: ${error.message}`)
    return []
  }
  return (data ?? []) as DataRecord[]
}

/** Ultima leitura por estacao + soma de precipitacao das leituras recentes. */
async function fetchClima(client: SupabaseClient): Promise<DataRecord[]> {
  const records = await selectAll(
    client,
    'climate_data',
    'station_code,station_name,municipality,temperature,humidity,pressure,wind_speed,precipitation,observed_at',
    (q) => q.order('observed_at', { ascending: false }).limit(100),
  )

  const precipByStation = new Map<string, number>()
  for (const r of records) {
    const sc = String(r.station_code ?? '')
    precipByStation.set(sc, (precipByStation.get(sc) ?? 0) + Number(r.precipitation ?? 0))
  }

  const seen = new Set<string>()
  const latest: DataRecord[] = []
  for (const r of records) {
    const sc = r.station_code
    if (typeof sc === 'string' && sc && !seen.has(sc)) {
      seen.add(sc)
      latest.push({ ...r, precipitation_24h: precipByStation.get(sc) ?? 0 })
    }
  }
  return latest
}

/** Semana epidemiologica mais recente por municipio. */
async function fetchSaude(client: SupabaseClient): Promise<DataRecord[]> {
  const records = await selectAll(
    client,
    'dengue_data',
    'ibge_code,municipality_name,epidemiological_week,year,cases,alert_level,incidence_rate',
    (q) =>
      q
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(200),
  )
  const seen = new Set<string>()
  const latest: DataRecord[] = []
  for (const r of records) {
    const ibge = r.ibge_code
    if (ibge && !seen.has(String(ibge))) {
      seen.add(String(ibge))
      latest.push(r)
    }
  }
  return latest
}

/** Registro unico agregado: focos de incendio nas ultimas 24h. */
async function fetchAmbiente(client: SupabaseClient): Promise<DataRecord[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { count, error } = await client
    .from('fire_spots')
    .select('id', { count: 'exact', head: true })
    .gte('acq_date', cutoff)
  if (error) {
    console.warn(`fire_spots: ${error.message}`)
    return []
  }
  return [{ fire_spots_24h: count ?? 0 }]
}

async function fetchDomainData(client: SupabaseClient, domain: string): Promise<DataRecord[]> {
  switch (domain) {
    case 'clima':
      return await fetchClima(client)
    case 'saude':
      return await fetchSaude(client)
    case 'ambiente':
      return await fetchAmbiente(client)
    case 'hidro':
      return await selectAll(
        client,
        'river_levels',
        'station_code,station_name,river_name,municipality,level_cm,flow_m3s,alert_level,observed_at',
      )
    case 'ar':
      return await selectAll(
        client,
        'air_quality',
        'city,station_name,aqi,dominant_pollutant,pm25,pm10,observed_at',
      )
    case 'composto':
      return await selectAll(client, 'irtc_scores', 'ibge_code,municipality,irtc_score,risk_level')
    default:
      console.warn(`dominio desconhecido: ${domain}`)
      return []
  }
}

// ---------------------------------------------------------------------------
// Avaliacao de condicao
// ---------------------------------------------------------------------------

const OPERATORS: Record<string, (a: number | string, b: number | string) => boolean> = {
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
}

function evaluateCondition(condition: Condition, records: DataRecord[]): DataRecord[] {
  const { field, operator, threshold } = condition
  if (!field || !operator || threshold === undefined || threshold === null) {
    console.warn(`condicao incompleta: ${JSON.stringify(condition)}`)
    return []
  }
  const opFn = OPERATORS[operator]
  if (!opFn) {
    console.warn(`operador desconhecido: ${operator}`)
    return []
  }

  const numeric = typeof threshold === 'number'
  const matching: DataRecord[] = []

  for (const record of records) {
    const raw = record[field]
    if (raw === null || raw === undefined) continue

    if (numeric) {
      const value = Number(raw)
      if (Number.isNaN(value)) continue
      if (opFn(value, threshold as number)) matching.push(record)
    } else {
      if (opFn(String(raw), String(threshold))) matching.push(record)
    }
  }
  return matching
}

function parseCondition(rule: AlertRule): Condition | null {
  if (typeof rule.condition !== 'string') return rule.condition ?? null
  try {
    return JSON.parse(rule.condition) as Condition
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Corpo da notificacao
// ---------------------------------------------------------------------------

/** Rotulo do registro conforme o dominio (o Python tinha um if por dominio). */
const DOMAIN_LABEL_FIELDS: Record<string, string[]> = {
  clima: ['station_name', 'station_code'],
  saude: ['municipality_name', 'ibge_code'],
  ambiente: [],
  hidro: ['station_name', 'station_code'],
  ar: ['city', 'station_name'],
  composto: ['municipality', 'ibge_code'],
}

function buildBody(rule: AlertRule, condition: Condition, matching: DataRecord[]): string {
  const lines: string[] = []
  if (rule.description) lines.push(rule.description)
  lines.push(`Condicao: ${condition.field} ${condition.operator} ${condition.threshold}`)

  const labelFields = DOMAIN_LABEL_FIELDS[rule.domain] ?? []
  const limit = rule.domain === 'ambiente' ? 3 : 5
  const field = condition.field ?? ''

  for (const r of matching.slice(0, limit)) {
    const value = r[field] ?? '?'
    if (labelFields.length === 0) {
      lines.push(`  - ${field}=${value}`)
      continue
    }
    const label = labelFields.map((f) => r[f]).find((v) => v !== null && v !== undefined) ?? '?'
    const river = rule.domain === 'hidro' ? ` (${r.river_name ?? ''})` : ''
    lines.push(`  - ${label}${river}: ${field}=${value}`)
  }

  if (matching.length > 5) lines.push(`  ... e mais ${matching.length - 5} registros`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Telegram (opcional)
// ---------------------------------------------------------------------------

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '\u{1f534}',
  high: '\u{1f7e0}',
  medium: '\u{1f7e1}',
  low: '\u{1f7e2}',
}

async function sendTelegram(title: string, body: string, severity: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return
  const emoji = SEVERITY_EMOJI[severity] ?? '⚪'
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} *${title}*\n${body}`,
        parse_mode: 'Markdown',
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    console.warn(`telegram: ${(err as Error).message}`)
  }
}

// ---------------------------------------------------------------------------
// Notificacoes e incidentes
// ---------------------------------------------------------------------------

function channelEnabled(channel: string, prefs: UserPrefs | undefined): boolean {
  if (!prefs) return channel !== 'telegram' // defaults: push/email on, telegram off
  if (channel === 'push') return prefs.push_enabled ?? true
  if (channel === 'email') return prefs.email_enabled ?? true
  if (channel === 'telegram') return prefs.telegram_enabled ?? false
  return true
}

async function createNotifications(
  client: SupabaseClient,
  rule: AlertRule,
  condition: Condition,
  matching: DataRecord[],
  userIds: string[],
  prefsByUser: Map<string, UserPrefs>,
): Promise<number> {
  if (userIds.length === 0) return 0

  const body = buildBody(rule, condition, matching)
  const channels = rule.channels?.length ? rule.channels : ['push']
  const severityRank = SEVERITY_ORDER[rule.severity] ?? 0
  const triggeredAt = new Date().toISOString()

  const rows: Record<string, unknown>[] = []
  for (const userId of userIds) {
    const prefs = prefsByUser.get(userId)
    const minRank = SEVERITY_ORDER[prefs?.min_severity ?? 'medium'] ?? 1
    if (severityRank < minRank) continue

    for (const channel of channels) {
      if (!channelEnabled(channel, prefs)) continue
      rows.push({
        rule_id: rule.id,
        user_id: userId,
        channel,
        title: rule.name,
        body,
        severity: rule.severity,
        metadata: {
          domain: rule.domain,
          condition,
          matching_count: matching.length,
          triggered_at: triggeredAt,
        },
        is_read: false,
      })
    }
  }

  if (rows.length === 0) return 0

  let created = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await client.from('notifications').insert(batch)
    if (error) console.warn(`notifications (${rule.name}): ${error.message}`)
    else created += batch.length
  }

  if (channels.includes('telegram')) await sendTelegram(rule.name, body, rule.severity)
  return created
}

async function maybeCreateIncident(
  client: SupabaseClient,
  rule: AlertRule,
  matching: DataRecord[],
): Promise<boolean> {
  if (!rule.auto_create_incident) return false

  const affected = matching.slice(0, 10).map((r) => ({
    ibge_code: r.ibge_code ?? '',
    name:
      r.municipality_name ?? r.municipality ?? r.city ?? r.station_name ?? 'Desconhecido',
  }))

  const { error } = await client.from('incidents').insert({
    title: `${rule.name} (${matching.length} registros)`,
    description: rule.description ?? '',
    type: DOMAIN_TO_INCIDENT_TYPE[rule.domain] ?? 'outro',
    severity: rule.severity,
    source_alert_id: rule.id,
    affected_municipalities: affected,
    context: {
      matching_count: matching.length,
      condition: rule.condition,
      domain: rule.domain,
      detected_by: 'etl_alerts_engine',
    },
  })

  if (!error) return true
  // 23505 = ja existe um incidente aberto para (type, source_alert_id).
  // Esse e o caminho normal, nao um erro.
  if (error.code !== '23505') console.warn(`incidents (${rule.name}): ${error.message}`)
  return false
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'alerts', async (client): Promise<RunResult> => {
    const stats = {
      rules_evaluated: 0,
      alerts_fired: 0,
      notifications_created: 0,
      incidents_created: 0,
      cooldown_skipped: 0,
      condition_not_met: 0,
    }
    const errors: string[] = []

    const { data: ruleData, error: ruleError } = await client
      .from('alert_rules')
      .select('*')
      .eq('is_active', true)
    if (ruleError) throw new Error(`alert_rules: ${ruleError.message}`)

    const rules = (ruleData ?? []) as AlertRule[]
    if (rules.length === 0) return { status: 'success', ...stats, rules_active: 0 }

    // --- Carregamentos unicos --------------------------------------------
    // Notificacoes recentes cobrindo o maior cooldown de todas as regras.
    // Uma query em vez de uma por regra disparada.
    const maxCooldown = Math.max(...rules.map((r) => r.cooldown_minutes ?? 60), 60)
    const cooldownCutoff = new Date(Date.now() - maxCooldown * 60_000).toISOString()
    const { data: recentNotifs } = await client
      .from('notifications')
      .select('rule_id,sent_at')
      .gte('sent_at', cooldownCutoff)
    const lastSentByRule = new Map<string, number>()
    for (const n of (recentNotifs ?? []) as { rule_id: string | null; sent_at: string }[]) {
      if (!n.rule_id) continue
      const t = new Date(n.sent_at).getTime()
      if (t > (lastSentByRule.get(n.rule_id) ?? 0)) lastSentByRule.set(n.rule_id, t)
    }

    const { data: profileData } = await client.from('profiles').select('id')
    const userIds = ((profileData ?? []) as { id: string }[]).map((p) => p.id)

    const { data: prefData } = await client
      .from('notification_preferences')
      .select('user_id,min_severity,push_enabled,email_enabled,telegram_enabled')
    const prefsByUser = new Map(
      ((prefData ?? []) as UserPrefs[]).map((p) => [p.user_id, p]),
    )

    // --- Dados por dominio, um fetch por dominio distinto -----------------
    const domains = [...new Set(rules.map((r) => r.domain))]
    const domainResults = await pooledMap(domains, 4, (d) => fetchDomainData(client, d))
    const dataByDomain = new Map<string, DataRecord[]>(
      domains.map((d, i) => [d, domainResults[i] ?? []]),
    )

    // --- Avaliacao --------------------------------------------------------
    const now = Date.now()
    for (const rule of rules) {
      stats.rules_evaluated++

      const records = dataByDomain.get(rule.domain) ?? []
      if (records.length === 0) {
        stats.condition_not_met++
        continue
      }

      const condition = parseCondition(rule)
      if (!condition) {
        errors.push(`condicao invalida na regra ${rule.name}`)
        continue
      }

      const matching = evaluateCondition(condition, records)
      if (matching.length === 0) {
        stats.condition_not_met++
        continue
      }

      const cooldownMinutes = rule.cooldown_minutes ?? 60
      const lastSent = lastSentByRule.get(rule.id)
      if (lastSent !== undefined && now - lastSent < cooldownMinutes * 60_000) {
        stats.cooldown_skipped++
        continue
      }

      stats.alerts_fired++
      try {
        stats.notifications_created += await createNotifications(
          client,
          rule,
          condition,
          matching,
          userIds,
          prefsByUser,
        )
        // Marca o disparo em memoria: duas regras nunca compartilham id, mas
        // isso protege caso a lista traga a mesma regra duas vezes.
        lastSentByRule.set(rule.id, now)
      } catch (err) {
        errors.push(`notificacao ${rule.name}: ${(err as Error).message}`)
      }

      if (await maybeCreateIncident(client, rule, matching)) stats.incidents_created++
    }

    const status = errors.length === 0
      ? 'success'
      : stats.alerts_fired > 0
      ? 'partial'
      : 'error'

    return { status, rules_active: rules.length, ...stats, errors }
  })
)
