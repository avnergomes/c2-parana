// npx deno test supabase/functions/etl-ambiente/ana.test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { dataHoraAnaIso, leituraMaisRecente, parseAnaXml } from './ana.ts'

Deno.test('data da ANA sem fuso ganha o horario de Brasilia', () => {
  assertEquals(dataHoraAnaIso('2026-10-27 13:15:00'), '2026-10-27T13:15:00-03:00')
  assertEquals(dataHoraAnaIso(' 2026-10-27T13:15 '), '2026-10-27T13:15-03:00')
  assertEquals(dataHoraAnaIso('2026-10-27T13:15:00Z'), '2026-10-27T13:15:00Z')
  assertEquals(dataHoraAnaIso(''), null)
  assertEquals(dataHoraAnaIso(null), null)
})

const bloco = (dataHora: string, nivel: string, vazao = '') =>
  `<DadosHidrometereologicos diffgr:id="x"><CodEstacao>65017006</CodEstacao>` +
  `<DataHora>${dataHora}</DataHora><Vazao>${vazao}</Vazao><Nivel>${nivel}</Nivel>` +
  `<Chuva>0.00</Chuva></DadosHidrometereologicos>`
const xml = (...blocos: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><DataTable><DocumentElement>${blocos.join('')}</DocumentElement></DataTable>`

Deno.test('ANA: vale o bloco mais recente, em qualquer ordem do XML', () => {
  const desc = parseAnaXml(xml(bloco('2026-10-27 14:00:00', '312'), bloco('2026-10-26 15:00:00', '280')))!
  assertEquals(leituraMaisRecente(desc), { levelCm: 312, flowM3s: null, observedAt: '2026-10-27T14:00:00-03:00' })
  const asc = parseAnaXml(xml(bloco('2026-10-26 15:00:00', '280'), bloco('2026-10-27 14:00:00', '312', '45.5')))!
  assertEquals(leituraMaisRecente(asc), { levelCm: 312, flowM3s: 45.5, observedAt: '2026-10-27T14:00:00-03:00' })
})

Deno.test('ANA: bloco mais novo sem nivel cede para o anterior valido', () => {
  const blocos = parseAnaXml(
    xml(bloco('2026-10-27 15:00:00', ''), bloco('2026-10-27 14:00:00', '305'), bloco('2026-10-27 13:00:00', 'x')),
  )!
  assertEquals(leituraMaisRecente(blocos)?.observedAt, '2026-10-27T14:00:00-03:00')
  assertEquals(leituraMaisRecente(blocos)?.levelCm, 305)
})

Deno.test('ANA: sem bloco valido ou sem XML', () => {
  assertEquals(leituraMaisRecente(parseAnaXml(xml(bloco('2026-10-27 15:00:00', '')))!), null)
  assertEquals(leituraMaisRecente(parseAnaXml(xml(bloco('', '300')))!), null)
  assertEquals(parseAnaXml('<html>erro</html>'), null)
  assertEquals(parseAnaXml('Service Unavailable'), null)
})
