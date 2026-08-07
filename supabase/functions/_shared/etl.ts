// supabase/functions/_shared/etl.ts
//
// Modulo compartilhado das Edge Functions de ETL.
//
// Consolida o que etl-aviacao / etl-clima faziam duplicado: client de service
// role, health record em data_cache, upsert em lote com retry, validacao do
// token de disparo e resposta JSON com CORS.
//
// Convencao de health record (a mesma ja em producao para aviacao/clima):
// grava SEMPRE em data_cache um registro `etl_health_<nome>` com um campo
// `status` ("success" | "partial" | "empty" | "error"). Difere dos scripts
// Python, que deletavam o registro em caso de sucesso (presenca == falha).
// Gravar sempre e melhor: da frescor observavel mesmo quando tudo funciona,
// que e o que a view etl_freshness consome.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export type { SupabaseClient }

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-etl-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export type EtlStatus = 'success' | 'partial' | 'empty' | 'error'

// --------------------------------------------------------------------------
// Client
// --------------------------------------------------------------------------

/**
 * Client Supabase com service role. As duas variaveis sao injetadas
 * automaticamente pelo runtime das Edge Functions.
 */
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente da funcao')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// --------------------------------------------------------------------------
// Autenticacao do disparo
// --------------------------------------------------------------------------

/**
 * Valida o header `x-etl-token` contra o secret `ETL_TRIGGER_TOKEN`.
 *
 * Retorna `null` quando a requisicao esta autorizada, ou uma Response 401
 * pronta para ser devolvida.
 *
 * Comportamento durante a migracao: se `ETL_TRIGGER_TOKEN` nao estiver
 * configurado no projeto, a funcao apenas registra um aviso e libera. Assim o
 * rollout nao quebra funcoes ja agendadas antes do secret existir. Assim que o
 * secret e definido (Fase 0.2), todas as funcoes passam a exigi-lo sem
 * necessidade de redeploy de codigo.
 */
export function assertEtlToken(req: Request): Response | null {
  const expected = Deno.env.get('ETL_TRIGGER_TOKEN')
  if (!expected) {
    console.warn('ETL_TRIGGER_TOKEN nao configurado: endpoint aberto (configure na Fase 0.2)')
    return null
  }
  const provided = req.headers.get('x-etl-token')
  if (provided !== expected) {
    console.warn('disparo rejeitado: x-etl-token invalido ou ausente')
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  return null
}

// --------------------------------------------------------------------------
// Respostas
// --------------------------------------------------------------------------

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Trata OPTIONS. Retorna a Response de preflight ou null se nao for OPTIONS. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}

// --------------------------------------------------------------------------
// data_cache
// --------------------------------------------------------------------------

interface CacheRow {
  cache_key: string
  source: string
  data: unknown
  fetched_at: string
  expires_at: string | null
  metadata: Record<string, unknown>
}

/**
 * Upsert de um payload em `data_cache`, chaveado por `cache_key`.
 *
 * @param ttlMinutes minutos ate `expires_at`. `null`/omitido grava expires_at nulo.
 */
export async function upsertCache(
  client: SupabaseClient,
  cacheKey: string,
  source: string,
  data: unknown,
  ttlMinutes: number | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date()
  const row: CacheRow = {
    cache_key: cacheKey,
    source,
    data,
    fetched_at: now.toISOString(),
    expires_at:
      ttlMinutes === null ? null : new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    metadata,
  }
  const { error } = await client.from('data_cache').upsert(row, { onConflict: 'cache_key' })
  if (error) throw new Error(`upsertCache(${cacheKey}): ${error.message}`)
}

/** Le o payload de um `cache_key`. Retorna null se ausente. */
export async function readCache<T = unknown>(
  client: SupabaseClient,
  cacheKey: string,
): Promise<T | null> {
  const { data, error } = await client
    .from('data_cache')
    .select('data')
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (error) throw new Error(`readCache(${cacheKey}): ${error.message}`)
  return (data?.data as T) ?? null
}

// --------------------------------------------------------------------------
// Health record
// --------------------------------------------------------------------------

/**
 * Grava `etl_health_<name>` em data_cache com `source = 'etl_<name>'`.
 *
 * Nunca lanca: um erro ao gravar o health nao pode derrubar um ETL que deu
 * certo. Falha apenas registra um warn.
 */
export async function writeHealth(
  client: SupabaseClient,
  name: string,
  status: EtlStatus,
  details: Record<string, unknown> = {},
): Promise<void> {
  const payload = {
    cache_key: `etl_health_${name}`,
    source: `etl_${name}`,
    data: {
      last_run: new Date().toISOString(),
      status,
      runtime: 'supabase-edge',
      ...details,
    },
    fetched_at: new Date().toISOString(),
    metadata: {},
  }
  const { error } = await client.from('data_cache').upsert(payload, { onConflict: 'cache_key' })
  if (error) console.warn(`writeHealth(${name}): ${error.message}`)
}

// --------------------------------------------------------------------------
// Upsert em lote
// --------------------------------------------------------------------------

export interface BatchResult {
  inserted: number
  errors: number
  failedBatches: number
}

/**
 * Upsert de muitas linhas em lotes, com retry exponencial por lote.
 *
 * Um lote que falha as 3 tentativas nao aborta os demais: conta em `errors` e
 * segue. ETL parcial e melhor que ETL nenhum.
 */
export async function batchUpsert(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  batchSize = 500,
): Promise<BatchResult> {
  const result: BatchResult = { inserted: 0, errors: 0, failedBatches: 0 }
  if (rows.length === 0) return result

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    let lastError = ''
    let ok = false

    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await client.from(table).upsert(batch, { onConflict })
      if (!error) {
        ok = true
        break
      }
      lastError = error.message
      await sleep(500 * 2 ** attempt)
    }

    if (ok) {
      result.inserted += batch.length
    } else {
      result.errors += batch.length
      result.failedBatches += 1
      console.error(`batchUpsert(${table}) lote ${i / batchSize}: ${lastError}`)
    }
  }
  return result
}

// --------------------------------------------------------------------------
// Utilitarios de rede e concorrencia
// --------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface FetchOptions extends RequestInit {
  /** Timeout por tentativa, em ms. Default 20000. */
  timeoutMs?: number
  /** Tentativas totais. Default 3. */
  retries?: number
}

/**
 * fetch com timeout, retry exponencial e retry apenas em 429/5xx/erro de rede.
 * 4xx (fora 429) nao e retentado: e erro do nosso lado, retentar so gasta tempo.
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 3, ...init } = opts
  let lastErr = ''

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = `HTTP ${resp.status}`
        await sleep(1000 * 2 ** attempt)
        continue
      }
      return resp
    } catch (err) {
      lastErr = (err as Error).message
      await sleep(1000 * 2 ** attempt)
    }
  }
  throw new Error(`fetchWithRetry(${url}) falhou apos ${retries} tentativas: ${lastErr}`)
}

/** fetch + JSON, com as mesmas garantias de fetchWithRetry. */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const resp = await fetchWithRetry(url, opts)
  if (!resp.ok) throw new Error(`fetchJson(${url}): HTTP ${resp.status}`)
  return (await resp.json()) as T
}

/**
 * fetch + texto decodificado como UTF-8 explicitamente.
 *
 * Necessario para fontes brasileiras que nao declaram charset no
 * Content-Type: sem isso o Deno assume latin-1 e "Paraná" vira "ParanÃ¡".
 * Aceita `fallbackCharset` para fontes que realmente servem latin-1.
 */
export async function fetchText(
  url: string,
  opts: FetchOptions & { charset?: string } = {},
): Promise<string> {
  const { charset = 'utf-8', ...rest } = opts
  const resp = await fetchWithRetry(url, rest)
  if (!resp.ok) throw new Error(`fetchText(${url}): HTTP ${resp.status}`)
  const buf = await resp.arrayBuffer()
  return new TextDecoder(charset).decode(buf)
}

/**
 * Executa `fn` sobre `items` com no maximo `limit` em voo.
 *
 * Substitui o ThreadPoolExecutor dos scripts Python. Preserva a ordem de
 * entrada na saida. Erros viram `null` na posicao correspondente em vez de
 * abortar o lote inteiro.
 */
export async function pooledMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try {
        results[index] = await fn(items[index], index)
      } catch (err) {
        console.warn(`pooledMap item ${index}: ${(err as Error).message}`)
        results[index] = null
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// --------------------------------------------------------------------------
// Wrapper de execucao
// --------------------------------------------------------------------------

export interface RunResult {
  status: EtlStatus
  [key: string]: unknown
}

/**
 * Envelope padrao de uma Edge Function de ETL.
 *
 * Cuida de preflight, token, cronometro, health record e tratamento de erro,
 * para que o corpo de cada ETL fique com a logica de dominio e nada mais.
 */
export async function runEtl(
  req: Request,
  name: string,
  body: (client: SupabaseClient, req: Request) => Promise<RunResult>,
): Promise<Response> {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const unauthorized = assertEtlToken(req)
  if (unauthorized) return unauthorized

  const startMs = Date.now()
  let client: SupabaseClient
  try {
    client = getServiceClient()
  } catch (err) {
    console.error(`${name}: ${(err as Error).message}`)
    return jsonResponse({ status: 'error', error: (err as Error).message }, 500)
  }

  try {
    const result = await body(client, req)
    const durationSeconds = (Date.now() - startMs) / 1000
    const { status, ...details } = result
    await writeHealth(client, name, status, { ...details, duration_seconds: durationSeconds })
    return jsonResponse({ status, ...details, duration_seconds: durationSeconds })
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    const durationSeconds = (Date.now() - startMs) / 1000
    console.error(`${name} falhou: ${message}`)
    await writeHealth(client, name, 'error', { error: message, duration_seconds: durationSeconds })
    return jsonResponse({ status: 'error', error: message, duration_seconds: durationSeconds }, 500)
  }
}
