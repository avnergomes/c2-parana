// supabase/functions/etl-escalation/index.ts
// Escalonamento automatico de incidentes por SLA.
//
// Porte Deno de scripts/etl_incident_escalation.py (a especificacao). DB->DB
// puro: nenhuma chamada externa. A cada 15 min, identifica incidentes ativos
// sem atendimento que estouraram o SLA da sua severidade e:
//   1. registra uma acao 'escalation' em incident_actions (audit trail);
//   2. cria notifications para os usuarios do role de destino;
//   3. incrementa incidents.escalation_count e atualiza last_escalated_at.
//
// SLA adaptativo: o threshold dobra a cada escalation (base * 2^count) e o
// sistema para apos MAX_ESCALATIONS, para nao virar spam.
// Regras vem de escalation_rules (seed na migration 024).

import { runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const MAX_ESCALATIONS = 3

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Baixo',
}

interface EscalationRule {
  id: string
  severity: string
  max_response_minutes: number
  escalate_to_role: string | null
  channels: string[] | null
}

interface Incident {
  id: string
  title: string
  type: string | null
  severity: string
  status: string
  detected_at: string
  acknowledged_at: string | null
  assigned_to: string | null
  escalation_count: number | null
  last_escalated_at: string | null
}

async function loadRules(client: SupabaseClient): Promise<Map<string, EscalationRule>> {
  const { data, error } = await client.from('escalation_rules').select('*').eq('is_active', true)
  if (error) throw new Error(`escalation_rules: ${error.message}`)
  return new Map((data as EscalationRule[]).map((r) => [r.severity, r]))
}

async function loadActiveIncidents(client: SupabaseClient): Promise<Incident[]> {
  const { data, error } = await client
    .from('incidents')
    .select(
      'id,title,type,severity,status,detected_at,acknowledged_at,assigned_to,escalation_count,last_escalated_at',
    )
    .not('status', 'in', '(resolved,closed)')
    .order('severity')
    .order('detected_at', { ascending: true })
  if (error) throw new Error(`incidents: ${error.message}`)
  return (data ?? []) as Incident[]
}

async function loadRecipientsByRole(
  client: SupabaseClient,
): Promise<{ commanders: string[]; operators: string[] }> {
  const { data, error } = await client.from('profiles').select('id,role')
  if (error) throw new Error(`profiles: ${error.message}`)
  const profiles = (data ?? []) as { id: string; role: string | null }[]
  return {
    commanders: profiles.filter((p) => p.role === 'commander').map((p) => p.id),
    // operators inclui commanders: quem comanda tambem recebe o que o operador recebe
    operators: profiles
      .filter((p) => p.role === 'commander' || p.role === 'operator')
      .map((p) => p.id),
  }
}

function shouldEscalate(incident: Incident, rule: EscalationRule, now: Date): boolean {
  if (incident.acknowledged_at) return false

  const count = incident.escalation_count ?? 0
  if (count >= MAX_ESCALATIONS) return false

  const thresholdMinutes = rule.max_response_minutes * 2 ** count
  const lastRef = incident.last_escalated_at ?? incident.detected_at
  const elapsedMinutes = (now.getTime() - new Date(lastRef).getTime()) / 60_000

  return elapsedMinutes >= thresholdMinutes
}

async function escalate(
  client: SupabaseClient,
  incident: Incident,
  rule: EscalationRule,
  commanders: string[],
  operators: string[],
  now: Date,
): Promise<boolean> {
  const newCount = (incident.escalation_count ?? 0) + 1
  const role = rule.escalate_to_role ?? 'commander'
  const recipients = role === 'commander' ? commanders : operators

  const elapsedMinutes = Math.trunc(
    (now.getTime() - new Date(incident.detected_at).getTime()) / 60_000,
  )
  const severityLabel = SEVERITY_LABELS[incident.severity] ?? incident.severity
  const description =
    `Escalation #${newCount}: incidente sem atendimento ha ${elapsedMinutes} min. ` +
    `Severidade ${severityLabel} escalada para role=${role}.`

  // 1. Audit trail. Se isto falha, aborta: escalar sem registro nao serve.
  const { error: actionError } = await client.from('incident_actions').insert({
    incident_id: incident.id,
    action_type: 'escalation',
    description,
    old_value: String(newCount - 1),
    new_value: String(newCount),
    metadata: {
      rule_id: rule.id,
      role,
      channels: rule.channels ?? [],
      elapsed_minutes: elapsedMinutes,
      recipients_count: recipients.length,
    },
  })
  if (actionError) {
    console.error(`incident_actions ${incident.id}: ${actionError.message}`)
    return false
  }

  // 2. Notificacoes: um registro por destinatario x canal.
  const channels = rule.channels?.length ? rule.channels : ['push']
  const notifications = recipients.flatMap((userId) =>
    channels.map((channel) => ({
      user_id: userId,
      channel,
      title: `Escalation: ${incident.title}`,
      body: description,
      severity: incident.severity,
      metadata: {
        domain: 'incident_escalation',
        incident_id: incident.id,
        escalation_count: newCount,
        source: 'etl_incident_escalation',
      },
    })),
  )
  if (notifications.length > 0) {
    const { error } = await client.from('notifications').insert(notifications)
    if (error) console.warn(`notifications ${incident.id}: ${error.message}`)
  }

  // 3. Marca o incidente. Sem isto, o proximo run reescalaria o mesmo caso.
  const { error: updateError } = await client
    .from('incidents')
    .update({ escalation_count: newCount, last_escalated_at: now.toISOString() })
    .eq('id', incident.id)
  if (updateError) console.warn(`incidents ${incident.id}: ${updateError.message}`)

  return true
}

Deno.serve((req: Request) =>
  runEtl(req, 'escalation', async (client): Promise<RunResult> => {
    const now = new Date()

    const rules = await loadRules(client)
    if (rules.size === 0) {
      throw new Error('nenhuma regra ativa em escalation_rules (aplicar migration 024)')
    }

    const incidents = await loadActiveIncidents(client)
    if (incidents.length === 0) {
      return {
        status: 'success',
        rules_active: rules.size,
        escalated: 0,
        skipped_not_due: 0,
        skipped_no_rule: 0,
      }
    }

    const { commanders, operators } = await loadRecipientsByRole(client)

    let escalated = 0
    let skippedNoRule = 0
    let skippedNotDue = 0
    let failed = 0

    for (const incident of incidents) {
      const rule = rules.get(incident.severity)
      if (!rule) {
        skippedNoRule++
        continue
      }
      if (!shouldEscalate(incident, rule, now)) {
        skippedNotDue++
        continue
      }
      if (await escalate(client, incident, rule, commanders, operators, now)) escalated++
      else failed++
    }

    return {
      status: failed > 0 ? 'partial' : 'success',
      rules_active: rules.size,
      incidents_active: incidents.length,
      escalated,
      skipped_not_due: skippedNotDue,
      skipped_no_rule: skippedNoRule,
      failed,
    }
  })
)
