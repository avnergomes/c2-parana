// supabase/functions/etl-lineup-appa/index.ts
// Line-up dos Portos de Paranaguá e Antonina (APPA) -> data_cache.
//
// Substitui, para o DGP Comando, a camada AIS que ficou sem dados: a
// AISStream não tem cobertura de receptores na costa do PR (diagnóstico
// 2026-09-13: ~1 mensagem em 120 s na bbox do Paraná). O line-up é a fonte
// oficial de navios atracados, ao largo, programados e esperados.
//
// Schedule: pg_cron a cada 30 min (migration 043). Payload em
// `appa_lineup_pr`, legível pela anon key. Parser e posições em parse.ts,
// berths.ts e payload.ts (puros, testados com fixture real).

import { fetchText, runEtl, upsertCache, type RunResult } from '../_shared/etl.ts'
import { parseLineup } from './parse.ts'
import { buildPayload, LINEUP_URL } from './payload.ts'

const CACHE_KEY = 'appa_lineup_pr'
const SOURCE = 'etl_lineup_appa'

Deno.serve((req: Request) =>
  runEtl(req, 'lineup_appa', async (client): Promise<RunResult> => {
    const html = await fetchText(LINEUP_URL, { timeoutMs: 45_000, retries: 3, charset: 'utf-8' })
    const lineup = parseLineup(html)
    const payload = buildPayload(lineup, new Date())

    // TTL de 90 min: o DGP trata linha expirada como fonte parada.
    await upsertCache(client, CACHE_KEY, SOURCE, payload, 90, {
      emitted_at: payload.emitted_at,
      navios_posicionados: payload.navios.length,
    })

    const total = Object.values(lineup.counts).reduce((a, b) => a + b, 0)
    return {
      status: total === 0 ? 'empty' : payload.bercos_sem_coordenada.length > 0 ? 'partial' : 'success',
      emitted_at: payload.emitted_at,
      counts: lineup.counts,
      navios_posicionados: payload.navios.length,
      bercos_sem_coordenada: payload.bercos_sem_coordenada,
      source: 'appa-lineup',
    }
  })
)
