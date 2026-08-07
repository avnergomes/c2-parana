// supabase/functions/etl-cemaden/index.ts
// Alertas geologicos/hidrologicos do CEMADEN -> cemaden_alerts (+ regras).
//
// Porte Deno de scripts/etl_cemaden.py (a especificacao).
//
// Diferencas deliberadas em relacao ao Python:
//
//  1. A lista de municipios vem de _shared/pr_municipios.ts em vez de
//     scripts/pr_municipios.json: Edge Function nao tem sistema de arquivos.
//     Mesmo conteudo, mesmo resultado de casamento por nome.
//
//  2. Cooldown com um fetch. O Python consultava notifications uma vez por par
//     (regra x alerta), o que com 20 alertas e 5 regras dava 100 round-trips.
//     Aqui uma unica consulta cobre a maior janela de cooldown e o resto e
//     avaliado em memoria.
//
//  3. Passa a gravar health record (etl_health_cemaden). O script Python nao
//     gravava nenhum, o que deixava o pipeline invisivel para a monitoracao de
//     frescor.

import { fetchWithRetry, runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { buildNameLookup } from '../_shared/pr_municipios.ts'
import {
  ALERT_TYPE_TO_INCIDENT_TYPE,
  buildAlert,
  CEMADEN_UF,
  CEMADEN_URL,
  type CemadenAlert,
  type CemadenRule,
  REQUEST_HEADERS,
} from './parse.ts'

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

function ruleMatches(rule: CemadenRule, alert: CemadenAlert): boolean {
  const condition = typeof rule.condition === 'string'
    ? safeParse(rule.condition)
    : rule.condition
  if (!condition || condition.type !== 'simple') return false

  const field = condition.field as string | undefined
  const op = condition.op as string | undefined
  const target = condition.value
  if (!field || !op) return false

  const current = (alert as unknown as Record<string, unknown>)[field]

  if (op === '=') return current === target
  if (op === '!=') return current !== target

  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    const lhs = Number(current)
    const rhs = Number(target)
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false
    if (op === '>') return lhs > rhs
    if (op === '>=') return lhs >= rhs
    if (op === '<') return lhs < rhs
    return lhs <= rhs
  }
  return false
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

async function insertNotification(
  client: SupabaseClient,
  rule: CemadenRule,
  alert: CemadenAlert,
): Promise<string | null> {
  const body = alert.description ??
    `Alerta ${alert.severity} (${alert.alert_type}) emitido em ${alert.issued_at} para ${alert.municipality}.`

  const { data, error } = await client
    .from('notifications')
    .insert({
      rule_id: rule.id,
      user_id: null,
      channel: 'push',
      title: `[CEMADEN] ${rule.name} — ${alert.municipality}`,
      body,
      severity: rule.severity,
      metadata: {
        source: 'cemaden',
        alert_code: alert.alert_code,
        alert_type: alert.alert_type,
        municipality: alert.municipality,
        ibge_code: alert.ibge_code,
        issued_at: alert.issued_at,
      },
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn(`notifications (${rule.name}/${alert.alert_code}): ${error.message}`)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

async function insertIncident(
  client: SupabaseClient,
  rule: CemadenRule,
  alert: CemadenAlert,
  notificationId: string | null,
): Promise<boolean> {
  const { error } = await client.from('incidents').insert({
    title: `CEMADEN ${alert.severity.replace(/_/g, ' ')} — ${alert.municipality}`,
    description: alert.description ??
      `Alerta CEMADEN (${alert.alert_type}) em ${alert.municipality}`,
    type: ALERT_TYPE_TO_INCIDENT_TYPE[alert.alert_type] ?? 'outro',
    severity: rule.severity,
    status: 'detected',
    affected_municipalities: [{ ibge_code: alert.ibge_code, name: alert.municipality }],
    source_alert_id: rule.id,
    source_notification_id: notificationId,
    context: {
      source: 'cemaden',
      alert_code: alert.alert_code,
      alert_type: alert.alert_type,
      severity: alert.severity,
      issued_at: alert.issued_at,
      geometry: alert.geometry_geojson,
    },
  })

  if (!error) return true
  // 23505: ja existe incidente aberto para (type, source_alert_id).
  if (error.code !== '23505') console.warn(`incidents (${alert.alert_code}): ${error.message}`)
  return false
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'cemaden', async (client): Promise<RunResult> => {
    const lookup = buildNameLookup()

    const resp = await fetchWithRetry(CEMADEN_URL, {
      headers: REQUEST_HEADERS,
      timeoutMs: 30_000,
    })
    if (!resp.ok) throw new Error(`CEMADEN HTTP ${resp.status}`)

    // O feed mistura charset; decodificar explicitamente como UTF-8 (o Python
    // forcava resp.encoding = "utf-8" pelo mesmo motivo).
    const text = new TextDecoder('utf-8').decode(await resp.arrayBuffer())
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error(`resposta CEMADEN nao e JSON: ${text.slice(0, 200)}`)
    }

    const allRaw = Array.isArray(payload.alertas)
      ? (payload.alertas as Record<string, unknown>[])
      : []
    const rawUf = allRaw.filter(
      (a) => String(a.uf ?? '').trim().toUpperCase() === CEMADEN_UF,
    )

    const alerts = rawUf
      .map((raw) => buildAlert(raw, lookup))
      .filter((a): a is CemadenAlert => a !== null)

    // --- Persistir -------------------------------------------------------
    const ingestedAt = new Date().toISOString()
    let upserted = 0
    if (alerts.length > 0) {
      const rows = alerts.map((a) => ({ ...a, ingested_at: ingestedAt }))
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200)
        const { error } = await client
          .from('cemaden_alerts')
          .upsert(batch, { onConflict: 'alert_code,issued_at' })
        if (error) throw new Error(`cemaden_alerts lote ${i / 200}: ${error.message}`)
        upserted += batch.length
      }
    }

    // --- Avaliar regras --------------------------------------------------
    const { data: ruleData, error: ruleError } = await client
      .from('alert_rules')
      .select('*')
      .eq('is_active', true)
      .eq('domain', 'cemaden')
    if (ruleError) console.warn(`alert_rules: ${ruleError.message}`)
    const rules = (ruleData ?? []) as CemadenRule[]

    let fired = 0
    let incidentsCreated = 0

    if (rules.length > 0 && alerts.length > 0) {
      // Um fetch cobrindo a maior janela de cooldown, em vez de uma consulta
      // por par (regra x alerta).
      const maxCooldown = Math.max(...rules.map((r) => r.cooldown_minutes ?? 60), 60)
      const cutoff = new Date(Date.now() - maxCooldown * 60_000).toISOString()
      const { data: recent } = await client
        .from('notifications')
        .select('rule_id,sent_at,metadata')
        .gte('sent_at', cutoff)
        .in('rule_id', rules.map((r) => r.id))

      // Chave rule_id|ibge_code: o cooldown do CEMADEN e por municipio, nao
      // por regra (dois municipios diferentes devem alertar em paralelo).
      const lastSent = new Map<string, number>()
      for (
        const n of (recent ?? []) as {
          rule_id: string | null
          sent_at: string
          metadata: Record<string, unknown> | null
        }[]
      ) {
        if (!n.rule_id) continue
        const ibge = String(n.metadata?.ibge_code ?? '')
        const key = `${n.rule_id}|${ibge}`
        const t = new Date(n.sent_at).getTime()
        if (t > (lastSent.get(key) ?? 0)) lastSent.set(key, t)
      }

      const now = Date.now()
      for (const alert of alerts) {
        for (const rule of rules) {
          if (!ruleMatches(rule, alert)) continue

          const cooldownMinutes = rule.cooldown_minutes ?? 60
          const key = `${rule.id}|${alert.ibge_code ?? ''}`
          const last = lastSent.get(key)
          if (last !== undefined && now - last < cooldownMinutes * 60_000) continue

          const notificationId = await insertNotification(client, rule, alert)
          fired++
          lastSent.set(key, now)

          if (rule.auto_create_incident) {
            if (await insertIncident(client, rule, alert, notificationId)) incidentsCreated++
          }
        }
      }
    }

    return {
      status: alerts.length === 0 ? 'empty' : 'success',
      feed_total: allRaw.length,
      feed_uf: rawUf.length,
      alerts_parsed: alerts.length,
      alerts_discarded: rawUf.length - alerts.length,
      upserted,
      rules_active: rules.length,
      notifications_created: fired,
      incidents_created: incidentsCreated,
      uf: CEMADEN_UF,
    }
  })
)
