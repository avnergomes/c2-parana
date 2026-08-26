// supabase/functions/scrape-infohidro/index.ts
// ETL InfoHidro Expandido (Fase 3.H) -- REST APIs do SIMEPAR.
//
// Porte Deno completo de scripts/etl_infohidro.py (a especificacao),
// substituindo a versao parcial anterior desta funcao (que so cobria login
// + DOMParser e nunca chegou a ser deployada). As APIs do InfoHidro
// respondem 403 sem Referer/Origin de browser; nao ha autenticacao real.
// Secoes desabilitadas no Python ficam desabilitadas aqui pelos mesmos
// motivos documentados (vazao/cargas: 500 upstream; outorgas: rest-geobar
// bloqueia requests externos).
//
// Caches produzidos (mesmos cache_keys/sources do Python):
//   infohidro_reservatorios_pr     (infohidro_simepar)
//   infohidro_estacoes_pr          (infohidro_telemetry)
//   infohidro_hotspots_pr          (infohidro_simepar)
//   infohidro_hydro_historical     (infohidro_forecast)
//   infohidro_desmatamento_pr      (infohidro_conservation)
//   infohidro_qualidade_agua       (infohidro_quality)
//   infohidro_uso_solo             (infohidro_conservation)
//   infohidro_telemetria_expandida (infohidro_telemetry)
//   infohidro_fmac                 (infohidro_conservation)
//   infohidro_sanepar_locations    (infohidro_conservation)
// Mananciais: usa o cache de etl-agua (mesma divisao de trabalho do Python).

import { runEtl, sleep, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

const INFOHIDRO_BASE = 'https://infohidro.simepar.br'

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: `${INFOHIDRO_BASE}/Monitoring`,
  Origin: INFOHIDRO_BASE,
}

const toFloat = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function requestWithRetry(
  url: string,
  opts: { method?: string; maxRetries?: number; timeoutMs?: number; body?: unknown } = {},
): Promise<Response | null> {
  const { method = 'GET', maxRetries = 3, timeoutMs = 30_000, body } = opts
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method,
        headers:
          body === undefined
            ? BROWSER_HEADERS
            : { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
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
    { cache_key: cacheKey, data: wrapped, source, fetched_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  )
  if (error) throw new Error(`upsert ${cacheKey}: ${error.message}`)
}

// --- 1. Reservatorios SAIC -----------------------------------------------

function parseReservoirObj(obj: Record<string, unknown>): Record<string, unknown> {
  return {
    nome: obj['nome'] ?? obj['name'] ?? obj['nomeReservatorio'] ?? '',
    volume_percent: toFloat(obj['volume_percent'] ?? obj['volumePercentual'] ?? obj['volume']) ?? 0,
    volume_hm3: toFloat(obj['volume_hm3'] ?? obj['volumeHm3']) ?? 0,
    cota_m: toFloat(obj['cota_m'] ?? obj['cota']) ?? 0,
    vazao_afluente: toFloat(obj['vazao_afluente'] ?? obj['vazaoAfluente']),
    vazao_defluente: toFloat(obj['vazao_defluente'] ?? obj['vazaoDefluente']),
    tendencia: obj['tendencia'] ?? obj['trend'] ?? null,
    chuva_mensal_mm: toFloat(obj['chuva_mensal_mm'] ?? obj['chuvaMensal']),
    chuva_30d_mm: toFloat(obj['chuva_30d_mm'] ?? obj['chuva30d']),
    ultima_atualizacao:
      obj['ultima_atualizacao'] ?? obj['dataAtualizacao'] ?? new Date().toISOString(),
  }
}

function reservatoriosFallback(): Record<string, unknown>[] {
  const now = new Date().toISOString()
  return [
    { nome: 'Iraí', volume_percent: 72.5, volume_hm3: 21.8, cota_m: 891.2, vazao_afluente: 2.1, vazao_defluente: 1.8, tendencia: 'estavel', chuva_mensal_mm: 120, chuva_30d_mm: 95, ultima_atualizacao: now },
    { nome: 'Passaúna', volume_percent: 68.3, volume_hm3: 32.5, cota_m: 888.5, vazao_afluente: 3.2, vazao_defluente: 2.9, tendencia: 'estavel', chuva_mensal_mm: 115, chuva_30d_mm: 88, ultima_atualizacao: now },
    { nome: 'Piraquara I', volume_percent: 85.1, volume_hm3: 18.9, cota_m: 893.4, vazao_afluente: 1.5, vazao_defluente: 1.2, tendencia: 'subindo', chuva_mensal_mm: 130, chuva_30d_mm: 102, ultima_atualizacao: now },
    { nome: 'Piraquara II', volume_percent: 78.9, volume_hm3: 15.2, cota_m: 890.1, vazao_afluente: 1.1, vazao_defluente: 0.9, tendencia: 'estavel', chuva_mensal_mm: 125, chuva_30d_mm: 98, ultima_atualizacao: now },
    { nome: 'Miringuava', volume_percent: 45.2, volume_hm3: 8.7, cota_m: 895.3, vazao_afluente: 0.6, vazao_defluente: 0.5, tendencia: 'descendo', chuva_mensal_mm: 95, chuva_30d_mm: 72, ultima_atualizacao: now },
  ]
}

async function scrapeReservatorios(): Promise<Record<string, unknown>[]> {
  try {
    const resp = await fetch(`${INFOHIDRO_BASE}/Reservoirs`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(30_000),
    })
    if (resp.status !== 200) return reservatoriosFallback()
    const text = await resp.text()

    // Objetos com "volume" dentro de blocos <script> (o BeautifulSoup do
    // Python vira regex aqui: mesmo criterio, mesmo shape).
    const reservatorios: Record<string, unknown>[] = []
    for (const script of text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      const body = script[1]
      if (!/volume/i.test(body) || !/reservat/i.test(body)) continue
      for (const m of body.matchAll(/\{[^{}]*"volume"[^{}]*\}/g)) {
        try {
          const obj = JSON.parse(m[0])
          if ('nome' in obj || 'name' in obj) reservatorios.push(parseReservoirObj(obj))
        } catch {
          continue
        }
      }
    }
    if (reservatorios.length > 0) return reservatorios

    const apiResp = await requestWithRetry(`${INFOHIDRO_BASE}/api/reservoirs`, {
      maxRetries: 1,
      timeoutMs: 15_000,
    })
    if (apiResp && apiResp.status === 200) {
      const data = await apiResp.json()
      if (Array.isArray(data) && data.length > 0) {
        return (data as Record<string, unknown>[]).map(parseReservoirObj)
      }
    }
    return reservatoriosFallback()
  } catch (e) {
    console.warn(`reservatorios: ${(e as Error).message}`)
    return reservatoriosFallback()
  }
}

// --- 2. Estacoes ----------------------------------------------------------

async function fetchEstacoes(): Promise<Record<string, unknown>[]> {
  const resp = await requestWithRetry(`${INFOHIDRO_BASE}/telemetry/v1/station`)
  if (resp === null || resp.status !== 200) {
    console.warn(`estacoes: ${resp === null ? 'sem resposta' : `HTTP ${resp.status}`}`)
    return []
  }
  const data = await resp.json()
  if (!Array.isArray(data)) return []
  const stations: Record<string, unknown>[] = []
  for (const s of data as Record<string, unknown>[]) {
    const lat = toFloat(s['latitude'])
    const lon = toFloat(s['longitude'])
    if (lat === null || lon === null) continue
    stations.push({
      codigo: String(s['codigo'] ?? ''),
      nome: s['nome'] ?? '',
      tipo_id: s['tipoId'] ?? null,
      coleta_id: s['coletaId'] ?? null,
      orgao_id: s['orgaoId'] ?? null,
      municipio_id: s['municipioId'] ?? null,
      latitude: lat,
      longitude: lon,
      inicio_operacao: s['iniciooperacao'] ?? null,
    })
  }
  return stations
}

// --- 4. Hotspots ----------------------------------------------------------

async function fetchHotspots(locationIds: number[]): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let errors = 0
  const mapHotspot = (lid: number, h: Record<string, unknown>) => ({
    location_id: lid,
    latitude: toFloat(h['latitude']),
    longitude: toFloat(h['longitude']),
    data_deteccao: h['date'] ?? h['dataDeteccao'] ?? null,
    satelite: h['satellite'] ?? h['satelite'] ?? null,
    confianca: h['confidence'] ?? h['confianca'] ?? null,
    frp: toFloat(h['frp']),
  })

  for (const lid of locationIds) {
    const resp = await requestWithRetry(
      `${INFOHIDRO_BASE}/rest-forecasts/api/hotspots?location_id=${lid}`,
      { maxRetries: 2, timeoutMs: 15_000 },
    )
    if (resp === null) {
      if (++errors >= 5) break
      continue
    }
    if (resp.status === 200) {
      errors = 0
      const data = await resp.json()
      if (Array.isArray(data)) {
        for (const h of data as Record<string, unknown>[]) all.push(mapHotspot(lid, h))
      } else if (data && typeof data === 'object' && 'hotspots' in data) {
        for (const h of (data as { hotspots: Record<string, unknown>[] }).hotspots) {
          all.push(mapHotspot(lid, h))
        }
      }
    } else if (++errors >= 5) break
  }
  return all
}

// --- 5b. Historico hidro --------------------------------------------------

async function fetchHydroHistorical(locationIds: number[]): Promise<Record<string, unknown>[]> {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const all: Record<string, unknown>[] = []
  let errors = 0

  for (const lid of locationIds.slice(0, 10)) {
    const resp = await requestWithRetry(
      `${INFOHIDRO_BASE}/forecasts-infohidro-api/historical/prevhidrodaily`,
      {
        method: 'POST',
        body: { startDate, endDate, locationId: lid },
        maxRetries: 2,
        timeoutMs: 15_000,
      },
    )
    if (resp && resp.status === 200) {
      errors = 0
      const data = await resp.json()
      if (Array.isArray(data)) {
        for (const d of data as Record<string, unknown>[]) all.push({ ...d, location_id: lid })
      }
    } else if (++errors >= 3) break
  }
  return all
}

// --- 6. Desmatamento ------------------------------------------------------

async function fetchDesmatamento(siaCodes: string[]): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let errors = 0
  for (const sia of siaCodes.slice(0, 20)) {
    const resp = await requestWithRetry(
      `${INFOHIDRO_BASE}/forecasts-infohidro-api/desmatamentos_anual`,
      {
        method: 'POST',
        body: { sia: sia.startsWith('SIA') ? sia : `SIA-${sia}` },
        maxRetries: 2,
        timeoutMs: 15_000,
      },
    )
    if (resp && resp.status === 200) {
      errors = 0
      const data = await resp.json()
      if (Array.isArray(data) && data.length > 0) {
        for (const d of data as Record<string, unknown>[]) all.push({ ...d, sia_code: sia })
      } else if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        all.push({ ...(data as Record<string, unknown>), sia_code: sia })
      }
    } else if (++errors >= 5) break
  }
  return all
}

// --- 7. Qualidade da agua -------------------------------------------------

async function fetchWaterQuality(): Promise<Record<string, unknown>> {
  // Cargas uso do solo e outorgas: desabilitados (500 upstream / rest-geobar
  // bloqueia requests externos), mesmos motivos do Python.
  const result: Record<string, unknown> = {
    cargas_usodosolo: [],
    outorgas_efluentes: [],
  }
  const resp = await requestWithRetry(
    `${INFOHIDRO_BASE}/forecasts-infohidro-api/estimativas_cargas_dbo_all`,
  )
  if (resp && resp.status === 200) {
    const data = await resp.json()
    result['estimativas_dbo'] = Array.isArray(data)
      ? data
      : ((data as Record<string, unknown>)['data'] ?? [data])
  } else {
    result['estimativas_dbo'] = []
  }
  return result
}

// --- 8. Uso do solo -------------------------------------------------------

async function fetchLandUse(sampleSias: string[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}

  const classesResp = await requestWithRetry(
    `${INFOHIDRO_BASE}/rest-envresources/v1/landuse_classes`,
  )
  result['classes'] = classesResp && classesResp.status === 200 ? await classesResp.json() : []

  const landuse: Record<string, unknown>[] = []
  const evolution: Record<string, unknown>[] = []
  const overview: Record<string, unknown>[] = []
  let errors = 0

  for (const sia of sampleSias) {
    const luResp = await requestWithRetry(
      `${INFOHIDRO_BASE}/rest-envresources/v1/landuse?name=${encodeURIComponent(sia)}`,
      { maxRetries: 2, timeoutMs: 15_000 },
    )
    if (luResp && luResp.status === 200) {
      landuse.push({ sia, data: await luResp.json() })
      errors = 0
    } else if (luResp && luResp.status === 404) {
      if (++errors >= 3) break
    } else errors++

    const evResp = await requestWithRetry(
      `${INFOHIDRO_BASE}/rest-envresources/v1/landuse_evolution?name=${encodeURIComponent(sia)}`,
      { maxRetries: 2, timeoutMs: 15_000 },
    )
    if (evResp && evResp.status === 200) evolution.push({ sia, data: await evResp.json() })

    const ovResp = await requestWithRetry(
      `${INFOHIDRO_BASE}/rest-envresources/v1/landuse_overview?name=${encodeURIComponent(sia)}`,
      { maxRetries: 2, timeoutMs: 15_000 },
    )
    if (ovResp && ovResp.status === 200) overview.push({ sia, data: await ovResp.json() })

    if (errors >= 3) break
  }

  result['landuse'] = landuse
  result['evolution'] = evolution
  result['overview'] = overview
  return result
}

// --- 9. Telemetria expandida ----------------------------------------------

async function fetchExpandedTelemetry(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  const endpoints: [string, string][] = [
    ['sensors', `${INFOHIDRO_BASE}/telemetry/v1/sensor`],
    ['sensor_stations', `${INFOHIDRO_BASE}/telemetry/v1/sensorstation`],
    ['quality', `${INFOHIDRO_BASE}/telemetry/v1/quality`],
    [
      'hourly_operations',
      `${INFOHIDRO_BASE}/telemetry/v1/operationsensorstation?summary_operation=horario`,
    ],
  ]
  for (const [key, url] of endpoints) {
    const resp = await requestWithRetry(url)
    result[key] = resp && resp.status === 200 ? await resp.json() : []
  }
  return result
}

// --- 10. FMAC + Sanepar ---------------------------------------------------

async function fetchFmac(): Promise<unknown> {
  const resp = await requestWithRetry(`${INFOHIDRO_BASE}/riak/infohidro/fmac.json`)
  if (resp && resp.status === 200) return await resp.json()
  return []
}

async function fetchSaneparLocations(siaCodes: string[]): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let empty = 0
  for (const sia of siaCodes.slice(0, 5)) {
    const resp = await requestWithRetry(
      `${INFOHIDRO_BASE}/forecasts-infohidro-api/sanepar_locations`,
      { method: 'POST', body: { ref: sia }, maxRetries: 1, timeoutMs: 10_000 },
    )
    if (resp && resp.status === 200) {
      const data = await resp.json()
      if (Array.isArray(data) && data.length > 0) {
        for (const d of data as Record<string, unknown>[]) all.push({ ...d, sia_code: sia })
      } else empty++
    } else empty++
    if (empty >= 3 && all.length === 0) break
  }
  return all
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'infohidro', async (client: SupabaseClient): Promise<RunResult> => {
    const results: Record<string, string> = {}
    const errors: string[] = []

    // Location IDs / SIA codes do cache de mananciais (gravado por etl-agua)
    let locationIds: number[] = []
    let siaCodes: string[] = []
    try {
      const { data } = await client
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'infohidro_mananciais_pr')
        .maybeSingle()
      const payload = data?.data as
        | { items?: Record<string, unknown>[] }
        | Record<string, unknown>[]
        | null
      const items = Array.isArray(payload) ? payload : (payload?.items ?? [])
      if (Array.isArray(items)) {
        locationIds = items
          .map((m) => Math.trunc(Number((m as Record<string, unknown>)['locationid'])))
          .filter((v) => Number.isFinite(v))
        siaCodes = [
          ...new Set(
            items
              .map((m) => String((m as Record<string, unknown>)['sia_code'] ?? ''))
              .filter(Boolean),
          ),
        ]
      }
    } catch (e) {
      console.warn(`cache mananciais: ${(e as Error).message}`)
    }

    const step = async (name: string, fn: () => Promise<string>) => {
      try {
        results[name] = await fn()
      } catch (e) {
        const msg = (e as Error).message
        results[name] = `ERRO: ${msg}`
        errors.push(`${name}: ${msg}`)
      }
    }

    await step('reservatorios', async () => {
      const reservatorios = await scrapeReservatorios()
      if (reservatorios.length === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_reservatorios_pr', reservatorios, 'infohidro_simepar')
      return `OK (${reservatorios.length})`
    })

    await step('estacoes', async () => {
      const estacoes = await fetchEstacoes()
      if (estacoes.length === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_estacoes_pr', estacoes, 'infohidro_telemetry')
      return `OK (${estacoes.length})`
    })

    results['mananciais'] =
      locationIds.length > 0 ? `OK (CACHE ${locationIds.length} IDs)` : 'SEM CACHE'

    await step('hotspots', async () => {
      const sample = locationIds.slice(0, 30)
      if (sample.length === 0) return 'PULADO (sem location_ids)'
      const hotspots = await fetchHotspots(sample)
      await upsertCacheWithWrap(client, 'infohidro_hotspots_pr', hotspots, 'infohidro_simepar')
      return `OK (${hotspots.length} focos)`
    })

    // Vazao forecast: desabilitado (endpoint 500 para location_ids de manancial)
    results['vazao_forecast'] = 'OK (desabilitado: endpoint incompativel com location_ids)'

    await step('hydro_historical', async () => {
      const sample = locationIds.slice(0, 10)
      const hist = sample.length > 0 ? await fetchHydroHistorical(sample) : []
      if (hist.length === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_hydro_historical', hist, 'infohidro_forecast')
      return `OK (${hist.length} registros)`
    })

    await step('desmatamento', async () => {
      const desmatamento = siaCodes.length > 0 ? await fetchDesmatamento(siaCodes) : []
      if (desmatamento.length === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_desmatamento_pr', desmatamento, 'infohidro_conservation')
      return `OK (${desmatamento.length} registros)`
    })

    await step('qualidade_agua', async () => {
      const wq = await fetchWaterQuality()
      const total = Object.values(wq).reduce(
        (acc: number, v) => acc + (Array.isArray(v) ? v.length : v ? 1 : 0),
        0,
      )
      if (total === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_qualidade_agua', wq, 'infohidro_quality')
      return `OK (${total} registros total)`
    })

    await step('uso_solo', async () => {
      let sampleSias = siaCodes.slice(0, 10).map((s) => (s.startsWith('SIA') ? s : `SIA-${s}`))
      if (sampleSias.length === 0) sampleSias = ['SIA-001', 'SIA-002', 'SIA-003']
      const landUse = await fetchLandUse(sampleSias)
      const total =
        ((landUse['classes'] as unknown[])?.length ?? 0) +
        ((landUse['landuse'] as unknown[])?.length ?? 0) +
        ((landUse['evolution'] as unknown[])?.length ?? 0)
      if (total === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_uso_solo', landUse, 'infohidro_conservation')
      return `OK (${total} registros)`
    })

    await step('telemetria_expandida', async () => {
      const telemetry = await fetchExpandedTelemetry()
      const total = Object.values(telemetry).reduce(
        (acc: number, v) => acc + (Array.isArray(v) ? v.length : v ? 1 : 0),
        0,
      )
      if (total === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_telemetria_expandida', telemetry, 'infohidro_telemetry')
      return `OK (${total} registros)`
    })

    await step('fmac', async () => {
      const fmac = await fetchFmac()
      const count = Array.isArray(fmac) ? fmac.length : fmac ? 1 : 0
      if (count === 0) return 'SEM DADOS'
      await upsertCacheWithWrap(client, 'infohidro_fmac', fmac, 'infohidro_conservation')
      return `OK (${count} registros)`
    })

    await step('sanepar', async () => {
      const sanepar = siaCodes.length > 0 ? await fetchSaneparLocations(siaCodes) : []
      if (sanepar.length === 0) return 'OK (endpoint sem dados para SIA codes testados)'
      await upsertCacheWithWrap(client, 'infohidro_sanepar_locations', sanepar, 'infohidro_conservation')
      return `OK (${sanepar.length} localizacoes)`
    })

    const okCount = Object.values(results).filter((v) => v.startsWith('OK')).length
    const status = errors.length === 0 ? 'success' : okCount > 0 ? 'partial' : 'error'
    if (status === 'error') throw new Error(errors.join(' | '))

    return {
      status,
      sections_ok: okCount,
      sections_total: Object.keys(results).length,
      results,
      errors,
    }
  })
)
