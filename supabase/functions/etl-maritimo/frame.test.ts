// npx deno test supabase/functions/etl-maritimo/frame.test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { frameToText } from './frame.ts'

const json = '{"MessageType":"PositionReport","MetaData":{"MMSI":710000001,"ShipName":"PARANAGUÁ"}}'
const bytes = new TextEncoder().encode(json)

Deno.test('decodifica string, ArrayBuffer, view e Blob preservando UTF-8', async () => {
  assertEquals(await frameToText(json), json)
  assertEquals(await frameToText(bytes.buffer.slice(0)), json)
  assertEquals(await frameToText(bytes), json)
  assertEquals(await frameToText(new Blob([bytes])), json)
  assertEquals(JSON.parse(await frameToText(new Blob([bytes]))).MetaData.ShipName, 'PARANAGUÁ')
})

Deno.test('o bug original: TextDecoder nao aceita Blob', () => {
  let threw = false
  try {
    new TextDecoder().decode(new Blob([bytes]) as unknown as ArrayBuffer)
  } catch {
    threw = true
  }
  assertEquals(threw, true)
})

Deno.test('tipo inesperado lanca TypeError claro', async () => {
  await assertRejects(() => frameToText(42), TypeError, 'tipo inesperado')
})
