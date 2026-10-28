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
