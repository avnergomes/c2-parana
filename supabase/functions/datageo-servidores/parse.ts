// supabase/functions/datageo-servidores/parse.ts
//
// Funções puras do datageo-servidores: relatório do SisPont (CSV cp1252,
// `;`, um servidor por linha) + Relação de Servidores do Portal da
// Transparência do PR (TB_RH.csv, UTF-8, `;`, todos os órgãos) -> payload
// minimizado para o DataGeo.
//
// Minimização (LGPD): do SisPont saem só identificação funcional, lotação e
// formação. RG, chefia, atos, portarias e protocolos NÃO entram no payload.
// O Portal não tem matrícula nem RG: a junção é por nome normalizado,
// desempatada pela lotação quando o nome se repete; empate sem desempate
// fica sem enriquecimento (não chuta).

export const SISPONT_COLS = ['ID', 'SERVIDOR', 'MUNICIPIO', 'SETOR', 'COORDENACAO', 'DIRETORIA', 'ESPECIALIDADE'] as const
export const PORTAL_COLS = ['sigla', 'nome', 'cargo', 'lotacao', 'dt_inicio'] as const

/** Maiúsculas, sem acento, espaços colapsados. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** '.' e vazio do SisPont viram ''. */
const valor = (s: unknown): string => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim()
  return v === '.' ? '' : v
}

/** CSV simples com `;` (as fontes não usam aspas). Falha se faltar coluna. */
export function parseSemicolonCsv(text: string, required: readonly string[]): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) throw new Error('CSV vazio')
  const header = lines[0].split(';').map((h) => h.trim())
  const faltando = required.filter((c) => !header.includes(c))
  if (faltando.length) throw new Error(`CSV sem colunas: ${faltando.join(', ')}`)
  return lines.slice(1).map((line) => {
    const cells = line.split(';')
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
  })
}

const slug = (s: string) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Chave da unidade de pesquisa do servidor, a mesma de estacoes-idr-pr.geojson.
 * Olha SETOR e COORDENACAO, do padrão mais específico ao mais amplo:
 *   "ESTAÇÃO DE PESQUISA - LONDRINA/IBIPORÃ"          -> "londrina-ibipora"
 *   "Coordenacao de Estacao de Pesquisa - Palotina"   -> "palotina"
 *   "Unidade de Pesquisa de Morretes"                 -> "morretes"
 *   "Polo de Pesquisa de Curitiba" / "Coordenacao do Polo de Pesquisa de X" -> "polo-curitiba"
 *   "Unidade Florestal de Castro" / "Unidade Florestal Doutor Ulysses"      -> "uf-castro"
 */
const ESPECIFICOS: ReadonlyArray<[RegExp, string]> = [
  [/ESTACAO DE PESQUISA\s*(?:-|DE |DA |DO )?\s*(.+)$/, ''],
  [/UNIDADE DE PESQUISA (?:DE |DA |DO )?(.+)$/, ''],
  [/UNIDADE FLORESTAL\s*(?:DE |DA |DO )?(.+)$/, 'uf-'],
]
const POLO: [RegExp, string] = [/POLO DE PESQUISA\s*(?:DE |DA |DO )?(.+)$/, 'polo-']

// Estações com uma coordenação só para duas áreas (um KML por área): todas
// as grafias caem na chave da coordenação.
const ESTACAO_ALIAS: Record<string, string> = {
  'londrina': 'londrina-ibipora', 'ibipora': 'londrina-ibipora',
  'cambara': 'cambara-joaquim-tavora', 'joaquim-tavora': 'cambara-joaquim-tavora', 'cambara-joaquim': 'cambara-joaquim-tavora',
  'pato-branco': 'pato-branco-palmas', 'palmas': 'pato-branco-palmas',
  'umuarama': 'umuarama-xambre', 'xambre': 'umuarama-xambre',
}

/**
 * Prioridade: SETOR específico (estação, unidade de pesquisa, unidade
 * florestal) > COORDENACAO específica > polo em qualquer um dos dois. O SETOR
 * vem primeiro porque a coordenação pode apontar para outra estação (chefe
 * acumulando).
 */
export function unidadeDe(setor: string, coordenacao: string): string | null {
  const [s, c] = [setor, coordenacao].map((v) => norm(v).replace(/[\s-]+$/, ''))
  const tentativas: Array<[string, [RegExp, string]]> = [
    ...ESPECIFICOS.map((p): [string, [RegExp, string]] => [s, p]),
    ...ESPECIFICOS.map((p): [string, [RegExp, string]] => [c, p]),
    [s, POLO],
    [c, POLO],
  ]
  for (const [v, [re, prefixo]] of tentativas) {
    const m = re.exec(v)
    if (!m) continue
    const chave = slug(m[1])
    return prefixo ? `${prefixo}${chave}` : ESTACAO_ALIAS[chave] ?? chave
  }
  return null
}

/** "EAGO - Engenharia Agronômica" -> "Engenharia Agronômica"; "ADM- Administrador" -> "Administrador". */
export function limpaEspecialidade(s: string): string {
  const v = valor(s)
  const m = /^[A-Z]{2,6}\s*[-–]\s*(.+)$/.exec(v)
  return (m ? m[1] : v).trim()
}

/** "ENGENHEIRO AGRONOMO" -> "Engenheiro Agronomo" (o Portal vem sem acento em parte dos cargos). */
export function tituloCargo(s: string): string {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com'])
  return valor(s).toLowerCase().split(' ').map((w, i) =>
    i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ')
}

// Formações de apoio (administrativo/operacional): não contam como técnico
// extensionista, mesmo lotadas na Diretoria de Extensão Rural.
const NAO_TECNICO = /ADMINISTRATIV|ADMINISTRADOR|OPERACIONAL|OPERARIO|OPERADOR|CAPATAZ|^AUX|MOTORISTA|TRATORISTA|MECANICO|LIMPEZA|SERVICOS GERAIS|VIGIA|COPEIR|CONTADOR|PSICOLOG|TELEFONISTA|DATILOGRAF|SECRETARI|RECEPCIONISTA|ALMOXARIF|ZELADOR|PROGRAMADOR|AGENTE DE APOIO/

export function isExtensionista(diretoria: string, formacao: string): boolean {
  if (!norm(diretoria).startsWith('DIRETORIA DE EXTENSAO RURAL')) return false
  if (!formacao) return true // sem formação conhecida: continua na lista, com "formação não informada"
  return !NAO_TECNICO.test(norm(formacao))
}

export interface PortalRow { nome: string; cargo: string; lotacao: string; admissao: string }

/** Linhas do IDR no TB_RH, indexadas por nome normalizado. */
export function indexaPortal(rows: Record<string, string>[]): Map<string, PortalRow[]> {
  const idx = new Map<string, PortalRow[]>()
  for (const r of rows) {
    if (norm(r.sigla) !== 'IDR') continue
    const k = norm(r.nome)
    const item = { nome: k, cargo: valor(r.cargo), lotacao: valor(r.lotacao), admissao: valor(r.dt_inicio) }
    idx.set(k, [...(idx.get(k) ?? []), item])
  }
  return idx
}

/** Registro do Portal para o servidor; homônimo sem desempate pela lotação -> null. */
export function casaPortal(idx: Map<string, PortalRow[]>, nome: string, municipio: string): PortalRow | null {
  const hits = idx.get(norm(nome)) ?? []
  if (hits.length <= 1) return hits[0] ?? null
  const mun = norm(municipio)
  const porLotacao = hits.filter((h) => mun && norm(h.lotacao).includes(mun))
  return porLotacao.length === 1 ? porLotacao[0] : null
}

export interface Servidor {
  id: string
  nome: string
  municipio: string
  setor: string
  diretoria: string
  formacao: string
  formacao_fonte: 'sispont' | 'portal' | null
  cargo_portal: string
  lotacao_portal: string
  admissao: string
  unidade: string | null
  extensionista: boolean
}

export function buildServidores(sispont: Record<string, string>[], portal: Map<string, PortalRow[]>): Servidor[] {
  const out: Servidor[] = []
  for (const r of sispont) {
    const nome = valor(r.SERVIDOR)
    // Lotações "DISPOSICAO ..." são linhas de controle do SisPont, não pessoas.
    if (!nome || /^DISPOSICAO\b/.test(norm(nome))) continue
    const municipio = valor(r.MUNICIPIO)
    const p = casaPortal(portal, nome, municipio)
    const esp = limpaEspecialidade(r.ESPECIALIDADE)
    const formacao = esp || (p?.cargo ? tituloCargo(p.cargo) : '')
    const diretoria = valor(r.DIRETORIA)
    out.push({
      id: valor(r.ID),
      nome,
      municipio,
      setor: valor(r.SETOR),
      diretoria,
      formacao,
      formacao_fonte: esp ? 'sispont' : formacao ? 'portal' : null,
      cargo_portal: p?.cargo ?? '',
      lotacao_portal: p?.lotacao ?? '',
      admissao: p?.admissao ?? '',
      unidade: unidadeDe(r.SETOR, r.COORDENACAO),
      extensionista: isExtensionista(diretoria, formacao),
    })
  }
  return out
}
