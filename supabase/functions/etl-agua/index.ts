// supabase/functions/etl-agua/index.ts
// Reservatorios SAIC + mananciais InfoHidro (agua).
//
// Porte Deno de scripts/etl_agua.py (a especificacao), com uma exclusao
// deliberada: o caminho Playwright (browser automation) nao existe em Edge
// Function. O proprio Python o trata como opcional e cai para o fallback
// hardcoded -- aqui a cadeia e: ANA REST -> API telemetria InfoHidro ->
// fallback hardcoded (flag using_fallback no health).
//
// Mananciais: o InfoHidro removeu o login self-service (2026-04); a rota
// atual tenta extrair fountains do HTML de /Monitoring (regex, caso o
// SIMEPAR volte a embutir) e, vazio, reusa o cache Supabase com flag stale.
// Este bloqueio e upstream (item P2#15 do STATUS: contato com SIMEPAR).

import { runEtl, sleep, readCache, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const INFOHIDRO_BASE = 'https://infohidro.simepar.br'

const toFloat = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function requestWithRetry(
  url: string,
  opts: { maxRetries?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<Response | null> {
  const { maxRetries = 3, timeoutMs = 30_000, headers } = opts
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      if (resp.status < 500) return resp
      if (attempt < maxRetries - 1) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      return resp
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      console.warn(`requestWithRetry(${url.split('?')[0]}): ${(err as Error).message}`)
      return null
    }
  }
  return null
}

async function upsertCacheWithWrap(
  client: SupabaseClient,
  cacheKey: string,
  data: unknown,
  source: string,
): Promise<void> {
  const wrapped = Array.isArray(data) ? { items: data } : data
  const { error } = await client.from('data_cache').upsert(
    {
      cache_key: cacheKey,
      data: wrapped,
      source,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' },
  )
  if (error) throw new Error(`upsert ${cacheKey}: ${error.message}`)
}

// --- Reservatorios --------------------------------------------------------

interface Reservatorio {
  nome: string
  volume_percent: number
  volume_hm3: number
  cota_m: number
  vazao_afluente: number | null
  vazao_defluente: number | null
  tendencia: string | null
  chuva_mensal_mm: number | null
  chuva_30d_mm: number | null
  ultima_atualizacao: string
}

function mapReservatorio(item: Record<string, unknown>): Reservatorio {
  return {
    nome: (item['name'] as string) || (item['nome'] as string) || 'Desconhecido',
    volume_percent: toFloat(item['volume']) ?? 0,
    volume_hm3: toFloat(item['volumeHm3']) ?? 0,
    cota_m: toFloat(item['cota']) ?? 0,
    vazao_afluente: toFloat(item['vazaoAfluente']),
    vazao_defluente: toFloat(item['vazaoDefluente']),
    tendencia: (item['tendencia'] as string) ?? null,
    chuva_mensal_mm: toFloat(item['chuvaMensal']),
    chuva_30d_mm: toFloat(item['chuva30d']),
    ultima_atualizacao: (item['ultima_atualizacao'] as string) || new Date().toISOString(),
  }
}

async function fetchReservatoriosAnaRest(): Promise<Reservatorio[]> {
  const resp = await requestWithRetry('https://www.ana.gov.br/sar0/MedicaoSin')
  if (resp === null || resp.status !== 200) return []
  try {
    const data = await resp.json()
    if (!Array.isArray(data) || data.length === 0) return []
    return (data as Record<string, unknown>[]).map(mapReservatorio)
  } catch {
    return []
  }
}

async function fetchReservatoriosTelemetryApi(): Promise<Reservatorio[]> {
  const resp = await requestWithRetry(`${INFOHIDRO_BASE}/api/telemetry/reservoirs`)
  if (resp === null || resp.status !== 200) return []
  try {
    let data = await resp.json()
    if (data && typeof data === 'object' && 'data' in data) data = data['data']
    if (!Array.isArray(data) || data.length === 0) return []
    return (data as Record<string, unknown>[]).map(mapReservatorio)
  } catch {
    return []
  }
}

function getReservatoriosFallback(): Reservatorio[] {
  const now = new Date().toISOString()
  return [
    { nome: 'Iraí', volume_percent: 72.5, volume_hm3: 21.8, cota_m: 891.2, vazao_afluente: 2.1, vazao_defluente: 1.8, tendencia: 'estavel', chuva_mensal_mm: 120, chuva_30d_mm: 95, ultima_atualizacao: now },
    { nome: 'Passaúna', volume_percent: 68.3, volume_hm3: 32.5, cota_m: 888.5, vazao_afluente: 3.2, vazao_defluente: 2.9, tendencia: 'estavel', chuva_mensal_mm: 115, chuva_30d_mm: 88, ultima_atualizacao: now },
    { nome: 'Piraquara I', volume_percent: 85.1, volume_hm3: 18.9, cota_m: 893.4, vazao_afluente: 1.5, vazao_defluente: 1.2, tendencia: 'subindo', chuva_mensal_mm: 130, chuva_30d_mm: 102, ultima_atualizacao: now },
    { nome: 'Piraquara II', volume_percent: 78.9, volume_hm3: 15.2, cota_m: 890.1, vazao_afluente: 1.1, vazao_defluente: 0.9, tendencia: 'estavel', chuva_mensal_mm: 125, chuva_30d_mm: 98, ultima_atualizacao: now },
    { nome: 'Miringuava', volume_percent: 45.2, volume_hm3: 8.7, cota_m: 895.3, vazao_afluente: 0.6, vazao_defluente: 0.5, tendencia: 'descendo', chuva_mensal_mm: 95, chuva_30d_mm: 72, ultima_atualizacao: now },
  ]
}

// --- Mananciais -----------------------------------------------------------

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: `${INFOHIDRO_BASE}/Monitoring`,
  Origin: INFOHIDRO_BASE,
}

interface Fountain {
  locationid: number
  locationname?: string
  [key: string]: unknown
}

async function extractFountainsFromMonitoringHtml(): Promise<Fountain[]> {
  try {
    const resp = await fetch(`${INFOHIDRO_BASE}/Monitoring`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(30_000),
    })
    if (resp.status !== 200) {
      console.warn(`Monitoring HTTP ${resp.status}`)
      return []
    }
    const text = await resp.text()

    for (const pattern of [
      /fountains\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
      /"fountains"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    ]) {
      const match = text.match(pattern)
      if (match) {
        try {
          const fountains = JSON.parse(match[1])
          if (Array.isArray(fountains) && fountains.length > 0) return fountains
        } catch {
          continue
        }
      }
    }

    const arrays = text.matchAll(
      /\[(\{[^[\]]*"locationid"[^[\]]*\}(?:,\{[^[\]]*"locationid"[^[\]]*\})*)\]/g,
    )
    for (const m of arrays) {
      try {
        const arr = JSON.parse(`[${m[1]}]`)
        if (arr.length > 100) return arr
      } catch {
        continue
      }
    }
    return []
  } catch (e) {
    console.warn(`extractFountains: ${(e as Error).message}`)
    return []
  }
}

interface Manancial {
  locationid: number
  sia_code: string
  municipio: string
  sistema: string
  rio: string
  vazao_m3s: null
  tendencia: null
  disponibilidade: string | null
  q1: number | null
  q30: number | null
  alerta: boolean
  chuva_mm: number | null
  prob_chuva: number | null
  temp_min: number | null
  temp_max: number | null
  umidade_min: number | null
  umidade_max: number | null
  ultima_atualizacao: string
}

async function fetchMananciaisViaSession(
  client: SupabaseClient,
): Promise<{ mananciais: Manancial[]; isStale: boolean }> {
  const fountains = await extractFountainsFromMonitoringHtml()
  if (fountains.length === 0) {
    // Esperado: /Monitoring e shell de SPA. Cai para o cache Supabase.
    const cached = await readCache<{ items?: Manancial[] } | Manancial[]>(
      client,
      'infohidro_mananciais_pr',
    )
    const items = Array.isArray(cached) ? cached : (cached?.items ?? [])
    return { mananciais: items, isStale: true }
  }

  const locationIds = fountains
    .filter((f) => f.locationid !== undefined)
    .map((f) => Math.trunc(Number(f.locationid)))
  const fountainMap = new Map(fountains.map((f) => [Math.trunc(Number(f.locationid)), f]))

  const waterData = new Map<number, Record<string, unknown>>()
  for (let i = 0; i < locationIds.length; i += 20) {
    const ids = locationIds.slice(i, i + 20).join(',')
    try {
      const resp = await fetch(
        `${INFOHIDRO_BASE}/forecast/v1/wateravailability?location_ids=${ids}`,
        { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30_000) },
      )
      if (resp.status === 200) {
        for (const d of (await resp.json()) as Record<string, unknown>[]) {
          const lid = d['locationid']
          if (lid !== null && lid !== undefined) waterData.set(Math.trunc(Number(lid)), d)
        }
      }
    } catch (e) {
      console.warn(`water batch ${i}: ${(e as Error).message}`)
    }
  }

  const meteoData = new Map<number, Record<string, unknown>>()
  for (let i = 0; i < locationIds.length; i += 20) {
    const ids = locationIds.slice(i, i + 20).join(',')
    try {
      const resp = await fetch(
        `${INFOHIDRO_BASE}/forecast/v1/forecastdata?summaryType=daily&source_ids=22&location_ids=${ids}`,
        { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30_000) },
      )
      if (resp.status === 200) {
        for (const d of (await resp.json()) as Record<string, unknown>[]) {
          const lid = d['locationid'] ?? d['location_id']
          if (lid !== null && lid !== undefined) meteoData.set(Math.trunc(Number(lid)), d)
        }
      }
    } catch (e) {
      console.warn(`meteo batch ${i}: ${(e as Error).message}`)
    }
  }

  const round5 = (v: number) => Math.round(v * 100000) / 100000
  const mananciais: Manancial[] = []
  for (const lid of locationIds) {
    const f = fountainMap.get(lid) ?? ({} as Fountain)
    const parts = ((f.locationname as string) ?? '').split(' - ').map((p) => p.trim())
    const water = waterData.get(lid) ?? {}
    const meteo = meteoData.get(lid) ?? {}

    const q1 = toFloat(water['q1'])
    const q30 = toFloat(water['q30'])
    let disponibilidade: string | null = null
    let alerta = false
    if (q1 !== null && q30 !== null && q1 > 0) {
      const ratio = q30 / q1
      if (ratio < 0.3) {
        disponibilidade = 'critico'
        alerta = true
      } else if (ratio < 0.6) {
        disponibilidade = 'baixo'
        alerta = true
      } else if (ratio < 0.9) {
        disponibilidade = 'normal'
      } else {
        disponibilidade = 'alto'
      }
    }

    mananciais.push({
      locationid: lid,
      sia_code: parts.length > 1 ? parts[1] : '',
      municipio: parts.length > 2 ? parts[2] : ((f.locationname as string) ?? ''),
      sistema: parts.length > 3 ? parts[3] : '',
      rio: parts.length > 4 ? parts[4] : '',
      vazao_m3s: null,
      tendencia: null,
      disponibilidade,
      q1: q1 !== null ? round5(q1) : null,
      q30: q30 !== null ? round5(q30) : null,
      alerta,
      chuva_mm: toFloat(meteo['precIntensity'] ?? meteo['precipIntensity']),
      prob_chuva: toFloat(meteo['precProbability'] ?? meteo['precipProbability']),
      temp_min: toFloat(meteo['tempMin']),
      temp_max: toFloat(meteo['tempMax']),
      umidade_min: toFloat(meteo['minHumidity']),
      umidade_max: toFloat(meteo['maxHumidity']),
      ultima_atualizacao: new Date().toISOString().slice(0, 10),
    })
  }
  return { mananciais, isStale: false }
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'agua', async (client: SupabaseClient): Promise<RunResult> => {
    const errors: string[] = []
    let usingFallback = false

    // 1/2 Reservatorios: ANA REST -> telemetria InfoHidro -> fallback fixo
    let reservatorios = await fetchReservatoriosAnaRest()
    if (reservatorios.length === 0) reservatorios = await fetchReservatoriosTelemetryApi()
    if (reservatorios.length === 0) {
      reservatorios = getReservatoriosFallback()
      usingFallback = true
    }

    let reservatoriosCount = 0
    try {
      await upsertCacheWithWrap(client, 'infohidro_reservatorios_pr', reservatorios, 'etl_agua')
      reservatoriosCount = reservatorios.length
    } catch (e) {
      errors.push(`Upsert reservatorios: ${(e as Error).message}`)
    }

    // 2/2 Mananciais
    let mananciaisCount = 0
    let mananciaisStale = false
    try {
      const { mananciais, isStale } = await fetchMananciaisViaSession(client)
      mananciaisStale = isStale
      if (mananciais.length > 0 && !isStale) {
        await upsertCacheWithWrap(client, 'infohidro_mananciais_pr', mananciais, 'infohidro_monitoring')
        mananciaisCount = mananciais.length
      } else if (mananciais.length > 0 && isStale) {
        mananciaisCount = mananciais.length
        errors.push(
          'Mananciais via cache (InfoHidro removeu login self-service; contatar SIMEPAR)',
        )
      } else {
        errors.push('Nao foi possivel extrair mananciais nem ler cache')
      }
    } catch (e) {
      errors.push(`Mananciais: ${(e as Error).message}`)
    }

    let status: RunResult['status'] = errors.length >= 2 ? 'error' : errors.length > 0 ? 'partial' : 'success'
    if (reservatoriosCount > 0 || mananciaisCount > 0) {
      status = errors.length > 0 ? 'partial' : 'success'
    }
    if (status === 'error') throw new Error(errors.join(' | '))

    return {
      status,
      reservatorios_count: reservatoriosCount,
      mananciais_count: mananciaisCount,
      mananciais_stale: mananciaisStale,
      using_fallback: usingFallback,
      errors,
    }
  })
)
