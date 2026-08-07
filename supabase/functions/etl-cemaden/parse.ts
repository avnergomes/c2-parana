// supabase/functions/etl-cemaden/parse.ts
//
// Logica pura de normalizacao do feed CEMADEN, separada do index.ts para que
// possa ser exercitada contra o feed real sem subir a Edge Function. O passo 5
// do checklist de cutover (comparar com o Python) depende disso.

import { stripAccentsLower } from '../_shared/pr_municipios.ts'

export const CEMADEN_URL = Deno.env.get('CEMADEN_URL') ??
  'https://painelalertas.cemaden.gov.br/wsAlertas2'
export const CEMADEN_UF = Deno.env.get('CEMADEN_UF') ?? 'PR'

export const REQUEST_HEADERS = {
  'User-Agent': 'C2Parana-CEMADEN-ETL/1.0 (+https://github.com/avnerpaesgomes/c2-parana)',
  Accept: 'application/json',
  Referer: 'https://painelalertas.cemaden.gov.br/',
}

const NIVEL_TO_SEVERITY: Record<string, string> = {
  'observacao': 'observacao',
  'observação': 'observacao',
  'atencao': 'atencao',
  'atenção': 'atencao',
  'moderado': 'atencao',
  'alerta': 'alerta',
  'alto': 'alerta',
  'muito alto': 'alerta_maximo',
  'alerta maximo': 'alerta_maximo',
  'alerta máximo': 'alerta_maximo',
}

// Ordem importa: o primeiro prefixo contido no texto vence (igual ao Python).
const EVENT_PREFIX_TO_TYPE: [string, string][] = [
  ['movimento de massa', 'movimento_massa'],
  ['deslizamento', 'movimento_massa'],
  ['risco geologico', 'geologico'],
  ['risco geológico', 'geologico'],
  ['risco hidrologico', 'hidrologico'],
  ['risco hidrológico', 'hidrologico'],
  ['meteorologico', 'meteorologico'],
  ['meteorológico', 'meteorologico'],
  ['alagamento', 'alagamento'],
  ['inundacao', 'inundacao'],
  ['inundação', 'inundacao'],
  ['enxurrada', 'enxurrada'],
  ['erosao', 'erosao'],
  ['erosão', 'erosao'],
]

export const ALERT_TYPE_TO_INCIDENT_TYPE: Record<string, string> = {
  geologico: 'deslizamento',
  movimento_massa: 'deslizamento',
  hidrologico: 'enchente',
  alagamento: 'enchente',
  inundacao: 'enchente',
  enxurrada: 'enchente',
  meteorologico: 'outro',
  erosao: 'outro',
}

export interface CemadenAlert {
  alert_code: string
  uf: string
  municipality: string
  ibge_code: string | null
  alert_type: string
  severity: string
  description: string | null
  geometry_geojson: { type: string; coordinates: [number, number] } | null
  issued_at: string
  expires_at: string | null
  source_url: string
  raw_payload: Record<string, unknown>
}

export interface CemadenRule {
  id: string
  name: string
  severity: string
  condition: Record<string, unknown> | string | null
  cooldown_minutes: number | null
  auto_create_incident: boolean | null
}

// ---------------------------------------------------------------------------
// Normalizacao
// ---------------------------------------------------------------------------

export function mapSeverity(nivel: unknown): string {
  if (typeof nivel !== 'string' || !nivel) return 'observacao'
  const key = nivel.toLowerCase().trim()
  return NIVEL_TO_SEVERITY[key] ?? NIVEL_TO_SEVERITY[stripAccentsLower(nivel)] ?? 'observacao'
}

export function mapAlertType(evento: unknown): string {
  if (typeof evento !== 'string' || !evento) return 'outro'
  const simple = stripAccentsLower(evento)
  for (const [prefix, mapped] of EVENT_PREFIX_TO_TYPE) {
    if (simple.includes(prefix)) return mapped
  }
  return 'outro'
}

/**
 * Equivalente ao str.title() do Python: maiuscula na primeira letra de cada
 * palavra, onde palavra e delimitada por qualquer caractere nao-letra.
 *
 * O feed entrega o municipio em caixa alta ("SAO JOSE DOS PINHAIS"). Um
 * `\w\S*` ingenuo nao serve porque `\w` e ASCII: "ANGULO" com circunflexo
 * viraria "ÂNgulo" (a regex pularia a letra acentuada inicial) e
 * "DIAMANTE D'OESTE" viraria "D'oeste". Ambos sao municipios reais do PR.
 */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

export function matchIbge(
  codibgeRaw: unknown,
  municipality: string,
  lookup: Map<string, string>,
): string | null {
  // O codigo do feed e autoritativo; o nome so entra quando ele falta.
  if (codibgeRaw !== null && codibgeRaw !== undefined && codibgeRaw !== '') {
    const code = String(codibgeRaw).trim()
    if (code && /^\d+$/.test(code)) return code
  }
  if (!municipality) return null
  return lookup.get(stripAccentsLower(municipality)) ??
    lookup.get(municipality.toLowerCase().trim()) ??
    null
}

/**
 * O feed entrega 'YYYY-MM-DD HH:MM:SS.mmm' sem fuso; o Python assume UTC.
 * Manter essa suposicao: mudar agora deslocaria o historico em 3 horas.
 */
export function parseCemadenDatetime(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const txt = raw.trim()

  // YYYY-MM-DD[ T]HH:MM:SS[.mmm]
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(txt)
  if (m) {
    const [, y, mo, d, h, mi, s, frac] = m
    const ms = frac ? Number(`0.${frac}`) * 1000 : 0
    return new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, Math.round(ms)),
    ).toISOString()
  }

  // DD-MM-YYYY ou DD/MM/YYYY HH:MM:SS
  m = /^(\d{2})[-/](\d{2})[-/](\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(txt)
  if (m) {
    const [, d, mo, y, h, mi, s] = m
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString()
  }

  return null
}

export function buildAlert(
  raw: Record<string, unknown>,
  lookup: Map<string, string>,
): CemadenAlert | null {
  const cod = raw.cod_alerta
  if (cod === null || cod === undefined) return null

  const issuedAt = parseCemadenDatetime(raw.datahoracriacao) ??
    parseCemadenDatetime(raw.ult_atualizacao)
  if (!issuedAt) return null

  const uf = String(raw.uf ?? '').trim().toUpperCase()
  const municipality = titleCase(String(raw.municipio ?? '').trim())

  const lat = raw.latitude
  const lon = raw.longitude
  const geometry = typeof lat === 'number' && typeof lon === 'number'
    ? { type: 'Point', coordinates: [lon, lat] as [number, number] }
    : null

  return {
    alert_code: String(cod).trim(),
    uf: uf || CEMADEN_UF,
    municipality,
    ibge_code: matchIbge(raw.codibge, municipality, lookup),
    alert_type: mapAlertType(raw.evento),
    severity: mapSeverity(raw.nivel),
    description: typeof raw.evento === 'string' ? raw.evento : null,
    geometry_geojson: geometry,
    issued_at: issuedAt,
    expires_at: null,
    source_url: 'https://painelalertas.cemaden.gov.br/',
    raw_payload: raw,
  }
}

