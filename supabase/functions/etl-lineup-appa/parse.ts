// supabase/functions/etl-lineup-appa/parse.ts
//
// Parser do relatório "Line-up retroativo" da APPA (Portos de Paranaguá e
// Antonina): HTML público, uma <table> por seção.
//
// Formato observado em 2026-09-13:
// - primeira linha de cada tabela: título da seção (<th colspan>);
// - segunda linha: cabeçalho, com colunas que variam por seção (13 a 22);
// - navio com mais de um operador/mercadoria ocupa várias linhas, e as
//   células comuns (programação, berço, embarcação...) vêm com rowspan.
//   Por isso a tabela é expandida numa grade antes de ler as colunas, e as
//   linhas são agrupadas pela programação.
//
// Puro (sem rede nem Deno APIs) para testar contra um fixture real.

export type SectionKey =
  | 'atracados'
  | 'programados'
  | 'ao_largo_reatracacao'
  | 'ao_largo'
  | 'esperados'
  | 'apoio'
  | 'despachados'

export const SECTION_KEYS: SectionKey[] = [
  'atracados', 'programados', 'ao_largo_reatracacao', 'ao_largo', 'esperados', 'apoio', 'despachados',
]

export interface LineupVessel {
  programacao: string
  duv: string | null
  berco: string | null
  embarcacao: string
  imo: string | null
  loa_m: number | null
  dwt_t: number | null
  sentido: string | null
  agencia: string | null
  operadores: string[]
  mercadorias: string[]
  chegada: string | null
  atracacao: string | null
  eta: string | null
  etb: string | null
  desatracacao: string | null
  janela_inicio: string | null
  janela_fim: string | null
  tipo_operacao: string | null
  status: string | null
  previsto: number | null
  realizado: number | null
  unidade: string | null
}

export interface Lineup {
  emitted_at: string | null
  sections: Record<SectionKey, LineupVessel[]>
  counts: Record<SectionKey, number>
}

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

const SECTION_BY_TITLE: Record<string, SectionKey> = {
  'atracados': 'atracados',
  'programados': 'programados',
  'ao largo para reatracacao': 'ao_largo_reatracacao',
  'ao largo': 'ao_largo',
  'esperados': 'esperados',
  'apoio portuario / outros': 'apoio',
  'despachados': 'despachados',
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

export function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Expande uma <table> numa grade de textos, resolvendo rowspan e colspan. */
export function tableToGrid(tableHtml: string): string[][] {
  const grid: string[][] = []
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0])
  rows.forEach((rowHtml, r) => {
    grid[r] ??= []
    let c = 0
    for (const cell of rowHtml.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      while (grid[r][c] !== undefined) c++
      const attrs = cell[2]
      const rowspan = Math.max(1, Number(/rowspan\s*=\s*['"]?(\d+)/i.exec(attrs)?.[1] ?? 1))
      const colspan = Math.max(1, Number(/colspan\s*=\s*['"]?(\d+)/i.exec(attrs)?.[1] ?? 1))
      const text = cellText(cell[3])
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= []
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = text
      }
      c += colspan
    }
  })
  return grid
}

/** "100.062,00" -> 100062; "0,000 Tons." -> 0; "600 Movs." -> 600; vazio -> null. */
export function parseBrNumber(s: string | undefined | null): number | null {
  const m = /-?[\d.]+(?:,\d+)?/.exec(String(s ?? ''))
  if (!m) return null
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "13/09/2026 08:50" (horário de Brasília) -> "2026-09-13T08:50:00-03:00". */
export function parseBrDateTime(s: string | undefined | null): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(String(s ?? ''))
  if (!m) return null
  const [, d, mo, y, h = '00', mi = '00'] = m
  return `${y}-${mo}-${d}T${h}:${mi}:00-03:00`
}

/** "13/09/2026 13:00 - 15/09/2026 06:36" -> [início, fim]. */
export function parseWindow(s: string | undefined | null): [string | null, string | null] {
  const parts = String(s ?? '').split(/\s+-\s+/)
  return [parseBrDateTime(parts[0]), parseBrDateTime(parts[1])]
}

const HEADER_KEYS: Record<string, string> = {
  'programacao': 'programacao',
  'duv': 'duv',
  'berco': 'berco',
  'embarcacao': 'embarcacao',
  'imo': 'imo',
  'loa': 'loa',
  'dwt': 'dwt',
  'sentido': 'sentido',
  'agencia': 'agencia',
  'operador': 'operador',
  'mercadoria': 'mercadoria',
  'atracacao': 'atracacao',
  'chegada': 'chegada',
  'janela operacional': 'janela',
  'previsto': 'previsto',
  'realizado': 'realizado',
  'eta': 'eta',
  'etb': 'etb',
  'desatracacao': 'desatracacao',
  'tipo de operacao': 'tipo_operacao',
  'status': 'status',
}

function unitOf(s: string | undefined): string | null {
  const m = /(Tons|Movs|Unid|Cab|m3|t)\.?\s*$/i.exec(String(s ?? '').trim())
  return m ? m[1].toLowerCase() : null
}

function blankToNull(s: string | undefined): string | null {
  const t = String(s ?? '').trim()
  return t ? t : null
}

function vesselFromRow(col: (key: string) => string | undefined): LineupVessel {
  const [janelaInicio, janelaFim] = parseWindow(col('janela'))
  const previstoRaw = col('previsto')
  return {
    programacao: String(col('programacao') ?? '').trim(),
    duv: blankToNull(col('duv')),
    berco: blankToNull(col('berco')),
    embarcacao: String(col('embarcacao') ?? '').trim(),
    imo: blankToNull(col('imo')),
    loa_m: parseBrNumber(col('loa')),
    dwt_t: parseBrNumber(col('dwt')),
    sentido: blankToNull(col('sentido')),
    agencia: blankToNull(col('agencia')),
    operadores: [],
    mercadorias: [],
    chegada: parseBrDateTime(col('chegada')),
    atracacao: parseBrDateTime(col('atracacao')),
    eta: parseBrDateTime(col('eta')),
    etb: parseBrDateTime(col('etb')),
    desatracacao: parseBrDateTime(col('desatracacao')),
    janela_inicio: janelaInicio,
    janela_fim: janelaFim,
    tipo_operacao: blankToNull(col('tipo_operacao')),
    status: blankToNull(col('status')),
    previsto: parseBrNumber(previstoRaw),
    realizado: parseBrNumber(col('realizado')),
    unidade: unitOf(previstoRaw),
  }
}

function parseSection(grid: string[][]): LineupVessel[] {
  const headerIdx = grid.findIndex((row) => row.some((c) => fold(c) === 'embarcacao'))
  if (headerIdx < 0) return []
  const index = new Map<string, number>()
  grid[headerIdx].forEach((name, i) => {
    const key = HEADER_KEYS[fold(name)]
    if (key && !index.has(key)) index.set(key, i)
  })

  const byKey = new Map<string, LineupVessel>()
  for (const row of grid.slice(headerIdx + 1)) {
    const col = (key: string) => {
      const i = index.get(key)
      return i === undefined ? undefined : row[i]
    }
    const embarcacao = String(col('embarcacao') ?? '').trim()
    if (!embarcacao) continue
    const programacao = String(col('programacao') ?? '').trim()
    const key = programacao || `${embarcacao}|${col('berco') ?? ''}`
    let vessel = byKey.get(key)
    if (!vessel) {
      vessel = vesselFromRow(col)
      byKey.set(key, vessel)
    }
    // Linha de continuação (rowspan): acumula operador e mercadoria novos.
    const operador = blankToNull(col('operador'))
    if (operador && !vessel.operadores.includes(operador)) vessel.operadores.push(operador)
    const mercadoria = blankToNull(col('mercadoria'))
    if (mercadoria && !vessel.mercadorias.includes(mercadoria)) vessel.mercadorias.push(mercadoria)
  }
  return [...byKey.values()]
}

/**
 * Lê o relatório inteiro. Lança se nenhuma seção conhecida for encontrada:
 * mudança de layout da APPA não pode virar "zero navios" silencioso.
 */
export function parseLineup(html: string): Lineup {
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, [] as LineupVessel[]])) as Record<SectionKey, LineupVessel[]>
  let found = 0
  for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const grid = tableToGrid(table[0])
    const title = fold(grid[0]?.[0] ?? '')
    const key = SECTION_BY_TITLE[title]
    if (!key) continue
    found += 1
    sections[key] = [...sections[key], ...parseSection(grid)]
  }
  if (found === 0) throw new Error('layout do line-up mudou: nenhuma seção reconhecida')

  const emitted = /Emiss(?:ão|&atilde;o|ao):\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/i.exec(html)
  const counts = Object.fromEntries(SECTION_KEYS.map((k) => [k, sections[k].length])) as Record<SectionKey, number>
  return { emitted_at: parseBrDateTime(emitted?.[1]), sections, counts }
}
