// supabase/functions/etl-legislativo/index.ts
// Projetos de lei da ALEP via API de Dados Abertos.
//
// Porte Deno de scripts/etl_legislativo.py (a especificacao). POST
// /proposicao/filtrar (ano corrente, 30 registros) + detalhes em paralelo
// (pool de 4, max 20 detalhes) + upsert em legislative_items por external_id.
//
// A base e HTTP (nao HTTPS) de proposito: o certificado do host
// webservices.assembleia.pr.leg.br tem ALT_NAME_INVALID (nota no Python).
//
// Divergencia deliberada: os status "SUCCESS/PARTIAL/UNAVAILABLE" (maiusculos)
// do Python viram os status canonicos do runEtl (success/partial/empty);
// api_available continua no health record para diagnostico.

import { runEtl, pooledMap, sleep, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const ALEP_BASE = 'http://webservices.assembleia.pr.leg.br/api/public'
const MAX_DETAIL_REQUESTS = 20
const DETAIL_THREADS = 4

const HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

/** Request com retry exponencial, retentando 429/5xx e erros de rede. */
async function requestWithRetry(
  method: string,
  url: string,
  opts: { maxRetries?: number; timeoutMs?: number; body?: unknown } = {},
): Promise<unknown | null> {
  const { maxRetries = 3, timeoutMs = 30_000, body } = opts
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method,
        headers: HEADERS,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (resp.status === 200) return await resp.json()
      if ([429, 500, 502, 503, 504].includes(resp.status)) {
        console.warn(`ALEP ${url}: HTTP ${resp.status}, retry ${attempt + 1}/${maxRetries}`)
        await sleep(1000 * 2 ** attempt)
        continue
      }
      console.warn(`ALEP ${url}: HTTP ${resp.status}`)
      return null
    } catch (err) {
      console.warn(`ALEP ${url}: ${(err as Error).message}, retry ${attempt + 1}/${maxRetries}`)
      await sleep(1500)
    }
  }
  console.warn(`ALEP ${url}: todas as ${maxRetries} tentativas falharam`)
  return null
}

interface Proposicao {
  codigo?: number
  numero?: string | number
  siglaTipoProposicao?: string
  tipoProposicao?: string
  assunto?: string
  autor?: string
  status?: string
  [key: string]: unknown
}

async function fetchProposicoes(year: number, limit: number): Promise<Proposicao[]> {
  const data = await requestWithRetry('POST', `${ALEP_BASE}/proposicao/filtrar`, {
    body: { ano: year, numeroMaximoRegistro: limit },
  })
  if (data === null) return []
  if (Array.isArray(data)) return data as Proposicao[]
  if (typeof data === 'object') {
    const obj = data as { sucesso?: boolean; lista?: Proposicao[] }
    if (obj.sucesso === false) {
      console.warn('ALEP proposicao/filtrar: sucesso=false')
      return []
    }
    return obj.lista ?? []
  }
  return []
}

async function fetchProposicaoDetail(codigo: number): Promise<Record<string, unknown> | null> {
  const data = await requestWithRetry('GET', `${ALEP_BASE}/proposicao/${codigo}`)
  if (data === null) return null
  if (typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    return (obj['valor'] as Record<string, unknown>) ?? obj
  }
  return null
}

function buildItem(
  pl: Proposicao,
  detail: Record<string, unknown> | null,
  year: number,
): Record<string, unknown> {
  const codigo = pl.codigo
  const numero = pl.numero ?? ''
  const tipo = pl.siglaTipoProposicao ?? pl.tipoProposicao ?? 'PL'

  let ementa: string | null = null
  if (detail) ementa = (detail['ementa'] as string) ?? (detail['assunto'] as string) ?? null
  if (!ementa) ementa = pl.assunto ?? pl.tipoProposicao ?? `${tipo} ${numero}/${year}`

  let autor: string | null = detail ? ((detail['autor'] as string) ?? null) : null
  if (!autor) autor = pl.autor ?? null

  let status: string | null = pl.status ?? null
  if (detail && !status) {
    status = (detail['status'] as string) ?? (detail['situacaoProcesso'] as string) ?? null
  }

  let publishedAt: string | null = null
  if (detail) {
    publishedAt =
      (detail['dataEntrada'] as string) ?? (detail['dataRecebimento'] as string) ?? null
  }
  if (!publishedAt) publishedAt = new Date().toISOString()

  const portalUrl = codigo
    ? `https://www.assembleia.pr.leg.br/pesquisa-legislativa/proposicao?idProposicao=${codigo}`
    : 'https://www.assembleia.pr.leg.br/'

  return {
    external_id: `alep-pl-${codigo ?? numero}-${year}`,
    type: 'projeto_lei',
    number: String(numero),
    year,
    title: ementa,
    description: detail ? ((detail['observacao'] as string) ?? null) : null,
    author: autor,
    status,
    url: portalUrl,
    published_at: publishedAt,
  }
}

Deno.serve((req: Request) =>
  runEtl(req, 'legislativo', async (client: SupabaseClient): Promise<RunResult> => {
    const year = new Date().getFullYear()
    const errors: string[] = []

    // Conectividade
    const campos = await requestWithRetry('GET', `${ALEP_BASE}/proposicao/campos`, {
      maxRetries: 2,
    })
    if (campos === null) {
      return {
        status: 'empty',
        api_available: false,
        reason: 'ALEP API indisponivel (possivel manutencao)',
        items_found: 0,
        items_saved: 0,
      }
    }

    const pls = await fetchProposicoes(year, 30)

    let detailsMap = new Map<number, Record<string, unknown>>()
    if (pls.length > 0) {
      const toFetch = pls.slice(0, MAX_DETAIL_REQUESTS).filter((pl) => pl.codigo)
      const results = await pooledMap(toFetch, DETAIL_THREADS, (pl) =>
        fetchProposicaoDetail(pl.codigo as number),
      )
      detailsMap = new Map()
      results.forEach((detail, i) => {
        if (detail) detailsMap.set(toFetch[i].codigo as number, detail)
      })
    }

    const items = pls.map((pl) =>
      buildItem(pl, pl.codigo ? (detailsMap.get(pl.codigo) ?? null) : null, year),
    )

    let itemsSaved = 0
    if (items.length > 0) {
      const { error } = await client
        .from('legislative_items')
        .upsert(items, { onConflict: 'external_id' })
      if (!error) {
        itemsSaved = items.length
      } else {
        errors.push(`upsert: ${error.message}`)
        // Fallback um a um, como o Python
        for (const item of items) {
          const { error: e1 } = await client
            .from('legislative_items')
            .upsert(item, { onConflict: 'external_id' })
          if (!e1) itemsSaved++
        }
      }
    }

    return {
      status: itemsSaved > 0 ? (errors.length > 0 ? 'partial' : 'success') : 'partial',
      api_available: true,
      items_found: items.length,
      items_saved: itemsSaved,
      details_fetched: detailsMap.size,
      errors,
    }
  })
)
