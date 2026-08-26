// supabase/functions/etl-healthcare/index.ts
// Leitos SUS / UTI do Parana (cache leitos_sus_pr para a SaudePage).
//
// Porte Deno de scripts/etl_healthcare.py (a especificacao). Tenta as fontes
// na mesma ordem do Python:
//   1. OpenDataSUS CNES /estabelecimentos (amostra; nunca fecha o total do
//      estado, entao o proprio Python cai para a proxima fonte de proposito);
//   2. CNES /leitos com totais por tipo (aceito se total > 1000);
//   3. Referencia estatica DATASUS/CNES (numeros publicados para o PR).
// O resultado vai para data_cache.cache_key = 'leitos_sus_pr'.

import { runEtl, upsertCache, fetchWithRetry, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const ESTADO_PR = 41
const CNES_API_BASE = 'https://apidadosabertos.saude.gov.br/cnes'

interface BedData {
  total_leitos: number
  leitos_uti: number
  ocupacao_uti_pct?: number
  source: string
}

async function fetchFromCnesApi(): Promise<BedData | null> {
  try {
    const url = `${CNES_API_BASE}/estabelecimentos?estado=${ESTADO_PR}&limit=20&offset=0`
    const resp = await fetchWithRetry(url, {
      timeoutMs: 30_000,
      retries: 1,
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) {
      console.warn(`CNES estabelecimentos: HTTP ${resp.status}`)
      return null
    }
    const data = await resp.json()
    const estabelecimentos: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : (data?.estabelecimentos ?? data?.data ?? [])
    if (!estabelecimentos || estabelecimentos.length === 0) return null

    let totalLeitos = 0
    for (const est of estabelecimentos) {
      totalLeitos += Math.trunc(Number(est['quantidade_leitos_internacao'] ?? 0) || 0)
    }
    // Amostra parcial (a API pagina): igual ao Python, descarta e segue para
    // a fonte seguinte, que tem totais estaduais.
    if (totalLeitos > 0) {
      console.warn('CNES estabelecimentos: amostra parcial, usando fonte de totais')
    }
    return null
  } catch (err) {
    console.warn(`CNES estabelecimentos: ${(err as Error).message}`)
    return null
  }
}

async function fetchLeitosCnesTotals(): Promise<BedData | null> {
  try {
    const url = `${CNES_API_BASE}/leitos?estado=${ESTADO_PR}&limit=100`
    const resp = await fetchWithRetry(url, {
      timeoutMs: 30_000,
      retries: 1,
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) {
      console.warn(`CNES leitos: HTTP ${resp.status}`)
      return null
    }
    const data = await resp.json()
    const records: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : (data?.leitos ?? data?.data ?? [])
    if (!records || records.length === 0) return null

    let totalLeitos = 0
    let leitosUti = 0
    for (const rec of records) {
      const qtd = Math.trunc(Number(rec['quantidade'] ?? 0) || 0)
      const tipo = String(rec['descricao'] ?? '').toLowerCase()
      totalLeitos += qtd
      if (tipo.includes('uti') || tipo.includes('intensiv')) leitosUti += qtd
    }
    if (totalLeitos > 1000) {
      return { total_leitos: totalLeitos, leitos_uti: leitosUti, source: 'cnes_api' }
    }
    console.warn('CNES leitos: dados insuficientes')
    return null
  } catch (err) {
    console.warn(`CNES leitos: ${(err as Error).message}`)
    return null
  }
}

/** Referencia estatica DATASUS/CNES para o PR (mesmos numeros do Python). */
function getStaticReferenceData(): BedData {
  return {
    total_leitos: 29847,
    leitos_uti: 3312,
    ocupacao_uti_pct: 76.4,
    source: 'datasus_cnes_reference',
  }
}

Deno.serve((req: Request) =>
  runEtl(req, 'healthcare', async (client: SupabaseClient): Promise<RunResult> => {
    const bedData =
      (await fetchFromCnesApi()) ?? (await fetchLeitosCnesTotals()) ?? getStaticReferenceData()

    const payload = {
      total_leitos: bedData.total_leitos,
      leitos_uti: bedData.leitos_uti,
      ocupacao_uti_pct: bedData.ocupacao_uti_pct ?? null,
      data_referencia: new Date().toISOString().slice(0, 10),
    }

    await upsertCache(client, 'leitos_sus_pr', bedData.source, payload)

    return {
      status: 'success',
      source: bedData.source,
      total_leitos: bedData.total_leitos,
      leitos_uti: bedData.leitos_uti,
    }
  })
)
