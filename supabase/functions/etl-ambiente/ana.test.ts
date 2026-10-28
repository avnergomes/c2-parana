// npx deno test supabase/functions/etl-ambiente/ana.test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { dataHoraAnaIso } from './ana.ts'

Deno.test('data da ANA sem fuso ganha o horario de Brasilia', () => {
  assertEquals(dataHoraAnaIso('2026-10-27 13:15:00'), '2026-10-27T13:15:00-03:00')
  assertEquals(dataHoraAnaIso(' 2026-10-27T13:15 '), '2026-10-27T13:15-03:00')
  assertEquals(dataHoraAnaIso('2026-10-27T13:15:00Z'), '2026-10-27T13:15:00Z')
  assertEquals(dataHoraAnaIso(''), null)
  assertEquals(dataHoraAnaIso(null), null)
})
