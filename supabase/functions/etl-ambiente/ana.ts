// supabase/functions/etl-ambiente/ana.ts
// Logica pura da ANA, separada do index.ts (que sobe o Deno.serve) para ser
// testavel: npx deno test supabase/functions/etl-ambiente/ana.test.ts

/**
 * Data/hora da ANA vem em horario de Brasilia e sem fuso; gravada assim num
 * timestamptz virava UTC e a leitura parecia 3 h mais velha. ISO sem fuso
 * ganha -03:00; qualquer outro formato passa como veio.
 */
export function dataHoraAnaIso(dataHora: string | null): string | null {
  if (!dataHora) return null
  const t = dataHora.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) return `${t.replace(' ', 'T')}-03:00`
  return t
}

export interface BlocoAna {
  nivel: string | null
  vazao: string | null
  dataHora: string | null
}

/**
 * Todos os blocos DadosHidrometereologicos do XML da ANA, na ordem do
 * arquivo, com nivel/vazao/datahora pelo mesmo casamento por substring de
 * tag do Python ('nivel' | 'vazao' | 'datahora' ou 'data'). null se a
 * resposta nao for XML ou nao tiver bloco.
 */
export function parseAnaXml(xml: string): BlocoAna[] | null {
  if (!xml.trimStart().startsWith('<')) return null
  const blocos = [...xml.matchAll(/<DadosHidrometereologicos[\s>][\s\S]*?<\/DadosHidrometereologicos>/gi)]
  if (blocos.length === 0) return null
  return blocos.map(([bloco]) => {
    let nivel: string | null = null
    let vazao: string | null = null
    let dataHora: string | null = null
    for (const m of bloco.matchAll(/<([\w:]+)[^>]*>([^<]*)<\/\1>/g)) {
      const tagLower = m[1].toLowerCase().split(':').pop() ?? ''
      const text = m[2]
      if (tagLower.includes('nivel')) nivel = text
      else if (tagLower.includes('vazao')) vazao = text
      else if (tagLower.includes('datahora') || tagLower.includes('data')) dataHora = text
    }
    return { nivel, vazao, dataHora }
  })
}

export interface LeituraAna {
  levelCm: number
  flowM3s: number | null
  observedAt: string
}

const numeroOuNull = (v: string | null): number | null => {
  if (v === null || !v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Leitura mais recente (maior DataHora) entre os blocos com nivel numerico
 * e data valida. A ordem dos blocos no XML nao e garantida; ate 2026-10 o
 * ETL pegava o ultimo bloco, que pode ser a leitura mais velha da janela.
 */
export function leituraMaisRecente(blocos: BlocoAna[]): LeituraAna | null {
  let melhor: LeituraAna | null = null
  let melhorT = -Infinity
  for (const b of blocos) {
    const levelCm = numeroOuNull(b.nivel)
    const observedAt = dataHoraAnaIso(b.dataHora)
    if (levelCm === null || observedAt === null) continue
    const t = Date.parse(observedAt)
    if (!Number.isFinite(t) || t <= melhorT) continue
    melhorT = t
    melhor = { levelCm, flowM3s: numeroOuNull(b.vazao), observedAt }
  }
  return melhor
}
