// npx deno test --allow-read supabase/functions/etl-lineup-appa/parse.test.ts
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  cellText,
  parseBrDateTime,
  parseBrNumber,
  parseLineup,
  parseWindow,
  tableToGrid,
} from './parse.ts'
import { anchoragePosition, BERTHS, berthPosition } from './berths.ts'
import { buildPayload } from './payload.ts'

const fixture = await Deno.readTextFile(new URL('./fixture-lineup.html', import.meta.url))

Deno.test('números e datas no formato brasileiro', () => {
  assertEquals(parseBrNumber('100.062,00'), 100062)
  assertEquals(parseBrNumber('0,000 Tons.'), 0)
  assertEquals(parseBrNumber('600 Movs.'), 600)
  assertEquals(parseBrNumber(''), null)
  assertEquals(parseBrDateTime('13/09/2026 08:50'), '2026-09-13T08:50:00-03:00')
  assertEquals(parseBrDateTime(''), null)
  assertEquals(parseWindow('13/09/2026 13:00 - 15/09/2026 06:36'), ['2026-09-13T13:00:00-03:00', '2026-09-15T06:36:00-03:00'])
  assertEquals(cellText('TCP <i>(SCS)</i>&nbsp;'), 'TCP (SCS)')
})

Deno.test('rowspan é replicado nas linhas de continuação', () => {
  const grid = tableToGrid(`<table>
    <tr><th colspan='3'>ATRACADOS</th></tr>
    <tr><th>Programação</th><th>Embarcação</th><th>Operador</th></tr>
    <tr><td rowspan='2'>1</td><td rowspan='2'>NAVIO A</td><td>OP 1</td></tr>
    <tr><td>OP 2</td></tr>
  </table>`)
  assertEquals(grid[3], ['1', 'NAVIO A', 'OP 2'])
})

Deno.test('fixture real: seções, emissão, agrupamento e acentos', () => {
  const lineup = parseLineup(fixture)
  assertEquals(lineup.emitted_at, '2026-09-13T13:57:00-03:00')
  for (const key of ['atracados', 'programados', 'ao_largo', 'esperados', 'apoio', 'despachados'] as const) {
    assert(lineup.counts[key] > 0, `seção ${key} vazia`)
  }
  const lins = lineup.sections.atracados.find((v) => v.embarcacao === 'MAERSK LINS')!
  assertEquals(lins.berco, '216')
  assertEquals(lins.imo, '9527025')
  assertEquals(lins.loa_m, 299.9)
  assertEquals(lins.mercadorias, ['CONTÊINERES (CONTENTORES) INCL'])
  assertEquals(lins.atracacao, '2026-09-13T08:50:00-03:00')
  assertEquals(lins.unidade, 'movs')

  // THRASYVOULOS V ocupa 2 linhas (dois operadores) e vira UM navio.
  const thras = lineup.sections.atracados.filter((v) => v.embarcacao === 'THRASYVOULOS V')
  assertEquals(thras.length, 1)
  assertEquals(thras[0].operadores.length, 2)
  assertEquals(thras[0].janela_fim, '2026-09-20T00:38:00-03:00')

  const programacoes = lineup.sections.atracados.map((v) => v.programacao)
  assertEquals(new Set(programacoes).size, programacoes.length)
})

Deno.test('payload: atracados no berço, ao largo em fundeio, resumos enxutos', () => {
  const lineup = parseLineup(fixture)
  const payload = buildPayload(lineup, new Date('2026-09-13T16:57:00Z'))
  assertEquals(payload.version, 1)
  assertEquals(payload.navios.filter((n) => n.secao === 'atracados').length, lineup.counts.atracados)
  assert(payload.navios.filter((n) => n.secao === 'ao_largo').every((n) => n.posicao.tipo === 'fundeio'))
  assert(payload.navios.filter((n) => n.secao === 'atracados').every((n) => n.posicao.tipo === 'berco'))
  assertEquals(Object.keys(payload.programados[0]).sort(), ['berco', 'chegada', 'embarcacao', 'eta', 'etb', 'loa_m', 'mercadorias', 'operadores', 'sentido'])
  assert(payload.esperados_proximos.length <= 25)
  assertEquals(payload.bercos_sem_coordenada, [])
})

Deno.test('layout desconhecido lança em vez de devolver zero navios', () => {
  assertThrows(() => parseLineup('<html><table><tr><th>OUTRA COISA</th></tr></table></html>'), Error, 'layout')
})

Deno.test('todo berço atracado do fixture tem posição; fundeio é determinístico', () => {
  const lineup = parseLineup(fixture)
  for (const v of lineup.sections.atracados) {
    assert(berthPosition(v.berco), `berço sem coordenada: ${v.berco}`)
  }
  assertEquals(berthPosition('999'), null)
  assertEquals(berthPosition('216')?.rumo, 82)
  assertEquals(berthPosition('141')?.rumo, 320)
  assertEquals(anchoragePosition(0).rumo, null)
  for (const b of Object.values(BERTHS)) assert(b.rumo >= 0 && b.rumo < 360, 'rumo fora de 0-360')
  assertEquals(berthPosition('200a')?.local, 'Berço 200A · Píer FOSPAR (Paranaguá)')
  assertEquals(anchoragePosition(7), anchoragePosition(7))
  const pts = new Set(Array.from({ length: 40 }, (_, i) => `${anchoragePosition(i).lat},${anchoragePosition(i).lon}`))
  assertEquals(pts.size, 40, 'navios ao largo não se sobrepõem')
  for (const b of Object.values(BERTHS)) {
    assert(b.lat > -25.6 && b.lat < -25.4 && b.lon > -48.7 && b.lon < -48.45, 'berço fora da baía')
  }
})
