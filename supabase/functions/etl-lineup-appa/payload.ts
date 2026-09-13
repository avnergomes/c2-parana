// supabase/functions/etl-lineup-appa/payload.ts
//
// Monta o payload gravado em data_cache (`appa_lineup_pr`) a partir do
// line-up parseado. Enxuto de propósito: o DGP baixa isto a cada poll.
// - navios com posição: atracados (no berço) e ao largo (fundeio ilustrativo);
// - próximos: programados + os 25 esperados com ETA mais próxima;
// - counts de todas as seções.

import type { Lineup, LineupVessel, SectionKey } from './parse.ts'
import { anchoragePosition, berthPosition, type VesselPosition } from './berths.ts'

export const LINEUP_URL = 'http://www.appaweb.appa.pr.gov.br/appaweb/pesquisa.aspx?WCI=relLineUpRetroativo'
const MAX_ESPERADOS = 25

export interface PositionedVessel extends LineupVessel {
  secao: SectionKey
  posicao: VesselPosition
}

/** Resumo de navio sem posição (programados/esperados): só o que o card mostra. */
export interface VesselSummary {
  embarcacao: string
  berco: string | null
  sentido: string | null
  loa_m: number | null
  operadores: string[]
  mercadorias: string[]
  eta: string | null
  etb: string | null
  chegada: string | null
}

export interface LineupPayload {
  version: 1
  emitted_at: string | null
  fetched_at: string
  source_url: string
  counts: Lineup['counts']
  navios: PositionedVessel[]
  programados: VesselSummary[]
  esperados_proximos: VesselSummary[]
  bercos_sem_coordenada: string[]
}

export function summarize(v: LineupVessel): VesselSummary {
  return {
    embarcacao: v.embarcacao,
    berco: v.berco,
    sentido: v.sentido,
    loa_m: v.loa_m,
    operadores: v.operadores,
    mercadorias: v.mercadorias,
    eta: v.eta,
    etb: v.etb,
    chegada: v.chegada,
  }
}

export function buildPayload(lineup: Lineup, fetchedAt: Date): LineupPayload {
  const navios: PositionedVessel[] = []
  const semCoordenada = new Set<string>()

  for (const v of lineup.sections.atracados) {
    const pos = berthPosition(v.berco)
    if (pos) navios.push({ ...v, secao: 'atracados', posicao: pos })
    else if (v.berco) semCoordenada.add(v.berco)
  }

  const aoLargo = [
    ...lineup.sections.ao_largo_reatracacao.map((v) => ({ v, secao: 'ao_largo_reatracacao' as const })),
    ...lineup.sections.ao_largo.map((v) => ({ v, secao: 'ao_largo' as const })),
  ]
  aoLargo.forEach(({ v, secao }, i) => navios.push({ ...v, secao, posicao: anchoragePosition(i) }))

  const byEta = (a: LineupVessel, b: LineupVessel) =>
    (Date.parse(a.eta ?? '') || Infinity) - (Date.parse(b.eta ?? '') || Infinity)
  const esperados = [...lineup.sections.esperados]
    .filter((v) => Date.parse(v.eta ?? '') >= fetchedAt.getTime() - 24 * 3600_000)
    .sort(byEta)
    .slice(0, MAX_ESPERADOS)

  return {
    version: 1,
    emitted_at: lineup.emitted_at,
    fetched_at: fetchedAt.toISOString(),
    source_url: LINEUP_URL,
    counts: lineup.counts,
    navios,
    programados: lineup.sections.programados.map(summarize),
    esperados_proximos: esperados.map(summarize),
    bercos_sem_coordenada: [...semCoordenada].sort(),
  }
}
