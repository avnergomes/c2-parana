// supabase/functions/etl-ambiente/index.ts
// NASA FIRMS (focos de calor) + AQICN (qualidade do ar) + ANA (rios).
//
// Porte Deno de scripts/etl_ambiente.py (a especificacao). As 3 fontes sao
// independentes: falha de uma nao derruba as outras (mesmo isolamento do
// Python). Secrets: NASA_FIRMS_KEY e WAQI_TOKEN (definidos na Fase 0).
//
// - FIRMS: CSV VIIRS_SNPP_NRT, bbox PR, janela 5 dias (maximo da API).
//   Insert um a um com dedup por 23505: o UNIQUE INDEX de fire_spots usa
//   COALESCE(acq_time,'') em expressao e on_conflict nao referencia indice
//   de expressao. Foco->municipio por ponto-no-poligono (_shared/pr_geo.ts,
//   mesma regra de scripts/pr_geo.py), gravando municipality e ibge_code;
//   foco fora do PR e descartado. Ate 2026-10 era o centroide mais proximo
//   (<= 80 km) com o bbox comecando em -54: 11 municipios do extremo Oeste
//   ficavam fora da busca e focos de SP/SC/MS entravam em municipios
//   paranaenses. Linhas antigas sem ibge_code sao reclassificadas a cada
//   execucao (backfillFireSpots) ate sairem da janela de 30 dias.
// - AQICN: 12 cidades por slug + fallback geo:lat;lon; upsert por city com
//   fallback delete+insert.
// - ANA: 8 estacoes fluviometricas, XML parseado por extracao de blocos
//   <DadosHidrometereologicos> (regex por tag, mesmo casamento por
//   substring de tag do Python); cotas de alerta por estacao. Estacao sem
//   leitura valida NAO e gravada: a ultima leitura real fica com a sua data
//   (o IRTC so usa leitura de ate 12 h). Antes a falha virava um registro
//   'normal' com observed_at = agora.

import { runEtl, sleep, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { municipioDoPonto } from '../_shared/pr_geo.ts'
import { dataHoraAnaIso } from './ana.ts'

// oeste,sul,leste,norte. O PR vai de -54,62 a -48,02 de longitude e de
// -26,72 a -22,52 de latitude; a folga cobre a fronteira inteira.
const PR_BBOX = '-54.7,-26.8,-47.9,-22.4'

const CIDADES_AR: { id: string; slug: string }[] = [
  { id: 'curitiba', slug: 'curitiba' },
  { id: 'londrina', slug: 'londrina' },
  { id: 'maringa', slug: 'maringá' },
  { id: 'foz', slug: 'foz-do-iguaçu' },
  { id: 'cascavel', slug: 'cascavel' },
  { id: 'ponta-grossa', slug: 'ponta-grossa' },
  { id: 'sao-jose-dos-pinhais', slug: 'são-josé-dos-pinhais' },
  { id: 'guarapuava', slug: 'guarapuava' },
  { id: 'umuarama', slug: 'umuarama' },
  { id: 'toledo', slug: 'toledo' },
  { id: 'paranagua', slug: 'paranaguá' },
  { id: 'apucarana', slug: 'apucarana' },
]

const CIDADES_AR_GEO: Record<string, { lat: number; lon: number }> = {
  curitiba: { lat: -25.43, lon: -49.27 },
  londrina: { lat: -23.31, lon: -51.16 },
  maringa: { lat: -23.42, lon: -51.94 },
  foz: { lat: -25.52, lon: -54.59 },
  cascavel: { lat: -24.9545, lon: -53.4596 },
  'ponta-grossa': { lat: -25.0959, lon: -50.1647 },
  'sao-jose-dos-pinhais': { lat: -25.5307, lon: -49.2 },
  guarapuava: { lat: -25.389, lon: -51.4638 },
  umuarama: { lat: -23.7652, lon: -53.3248 },
  toledo: { lat: -24.7257, lon: -53.7406 },
  paranagua: { lat: -25.5169, lon: -48.7296 },
  apucarana: { lat: -23.5707, lon: -51.4635 },
}

const ESTACOES_RIOS_PR = [
  { code: '65017006', name: 'Porto Amazonas', river: 'Rio Iguaçu', municipality: 'Porto Amazonas', lat: -25.55, lon: -49.88 },
  { code: '65310000', name: 'União da Vitória', river: 'Rio Iguaçu', municipality: 'União da Vitória', lat: -26.23, lon: -51.08 },
  { code: '64507000', name: 'Porto São José', river: 'Rio Paraná', municipality: 'São Pedro do Paraná', lat: -22.76, lon: -53.17 },
  { code: '64620000', name: 'Salto Caxias', river: 'Rio Iguaçu', municipality: 'Capitão Leônidas Marques', lat: -25.54, lon: -53.5 },
  { code: '65035000', name: 'São José dos Pinhais', river: 'Rio Iguaçu', municipality: 'São José dos Pinhais', lat: -25.53, lon: -49.2 },
  { code: '64693000', name: 'Foz do Iguaçu', river: 'Rio Iguaçu', municipality: 'Foz do Iguaçu', lat: -25.59, lon: -54.58 },
  { code: '65155000', name: 'São Mateus do Sul', river: 'Rio Iguaçu', municipality: 'São Mateus do Sul', lat: -25.87, lon: -50.38 },
  { code: '64475000', name: 'Tibagi', river: 'Rio Tibagi', municipality: 'Tibagi', lat: -24.51, lon: -50.41 },
]

const COTAS_ALERTA: Record<string, { attention: number; alert: number; emergency: number }> = {
  '65017006': { attention: 300, alert: 450, emergency: 600 },
  '65310000': { attention: 500, alert: 700, emergency: 900 },
  '64507000': { attention: 400, alert: 600, emergency: 800 },
  '64620000': { attention: 450, alert: 650, emergency: 850 },
  '65035000': { attention: 250, alert: 400, emergency: 550 },
  '64693000': { attention: 350, alert: 500, emergency: 700 },
  '65155000': { attention: 400, alert: 600, emergency: 800 },
  '64475000': { attention: 300, alert: 500, emergency: 700 },
}

// --- Utilitarios ----------------------------------------------------------

/** Request com retry exponencial; 5xx e erro de rede retentam, <500 retorna. */
async function requestWithRetry(
  url: string,
  opts: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<Response | null> {
  const { maxRetries = 3, timeoutMs = 30_000 } = opts
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
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

// --- FIRMS ----------------------------------------------------------------

interface FireSpot {
  latitude: number
  longitude: number
  municipality: string | null
  ibge_code: string | null
  brightness: number | null
  scan: number | null
  track: number | null
  acq_date: string
  acq_time: string | null
  satellite: string | null
  instrument: string
  confidence: string | null
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < header.length) continue
    const row: Record<string, string> = {}
    header.forEach((h, j) => (row[h] = parts[j]?.trim() ?? ''))
    rows.push(row)
  }
  return rows
}

async function fetchFirms(firmsKey: string): Promise<{ spots: FireSpot[]; foraDoPr: number }> {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${PR_BBOX}/5`
  const resp = await requestWithRetry(url, { maxRetries: 3, timeoutMs: 60_000 })
  if (resp === null) {
    console.warn('FIRMS: falha de conexao apos retries')
    return { spots: [], foraDoPr: 0 }
  }
  if (resp.status === 403 || resp.status === 429) {
    console.warn(`FIRMS: HTTP ${resp.status} - limite de API atingido`)
    return { spots: [], foraDoPr: 0 }
  }
  if (!resp.ok) {
    console.warn(`FIRMS: HTTP ${resp.status}`)
    return { spots: [], foraDoPr: 0 }
  }
  const text = await resp.text()
  const spots: FireSpot[] = []
  let foraDoPr = 0
  for (const row of parseCsv(text)) {
    const lat = Number(row['latitude'] ?? 0)
    const lon = Number(row['longitude'] ?? 0)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const mun = municipioDoPonto(lat, lon)
    if (mun === null) {
      foraDoPr++
      continue
    }
    spots.push({
      latitude: lat,
      longitude: lon,
      municipality: mun.nome,
      ibge_code: mun.ibge,
      brightness: row['bright_ti4'] ? Number(row['bright_ti4']) : null,
      scan: row['scan'] ? Number(row['scan']) : null,
      track: row['track'] ? Number(row['track']) : null,
      acq_date: row['acq_date'] || new Date().toISOString().slice(0, 10),
      acq_time: row['acq_time'] || null,
      satellite: row['satellite'] || null,
      instrument: 'VIIRS',
      confidence: row['confidence'] || null,
    })
  }
  return { spots, foraDoPr }
}

/**
 * Reclassifica focos gravados sem ibge_code (anteriores ao ponto-no-poligono):
 * dentro do PR ganham municipality/ibge_code; fora do PR sao apagados. Cada
 * linha tratada sai do filtro (ibge_code preenchido ou apagada), entao o laco
 * termina; o teto de paginas so protege o wall-clock da Edge Function.
 */
async function backfillFireSpots(
  client: SupabaseClient,
): Promise<{ atualizados: number; apagados: number; erros: number }> {
  let atualizados = 0
  let apagados = 0
  let erros = 0
  for (let pagina = 0; pagina < 10; pagina++) {
    const { data, error } = await client
      .from('fire_spots')
      .select('id,latitude,longitude,acq_date')
      .is('ibge_code', null)
      .limit(1000)
    if (error) {
      console.warn(`backfill fire_spots: ${error.message}`)
      erros++
      break
    }
    const linhas = (data ?? []) as { id: string; latitude: number; longitude: number; acq_date: string }[]
    if (linhas.length === 0) break
    const atualizar: Record<string, unknown>[] = []
    const apagar: string[] = []
    for (const l of linhas) {
      const mun = municipioDoPonto(l.latitude, l.longitude)
      if (mun === null) apagar.push(l.id)
      else atualizar.push({ ...l, municipality: mun.nome, ibge_code: mun.ibge })
    }
    for (let i = 0; i < atualizar.length; i += 200) {
      const { error: upErr } = await client
        .from('fire_spots')
        .upsert(atualizar.slice(i, i + 200), { onConflict: 'id' })
      if (upErr) {
        console.warn(`backfill fire_spots upsert: ${upErr.message}`)
        erros++
      } else atualizados += Math.min(200, atualizar.length - i)
    }
    for (let i = 0; i < apagar.length; i += 100) {
      const { error: delErr } = await client.from('fire_spots').delete().in('id', apagar.slice(i, i + 100))
      if (delErr) {
        console.warn(`backfill fire_spots delete: ${delErr.message}`)
        erros++
      } else apagados += Math.min(100, apagar.length - i)
    }
    if (erros > 0) break
  }
  return { atualizados, apagados, erros }
}

/** Insert um a um com dedup por 23505 (ver cabecalho). */
async function insertFireSpotsDedupe(
  client: SupabaseClient,
  records: FireSpot[],
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0
  let skipped = 0
  let errors = 0
  for (const rec of records) {
    const { error } = await client.from('fire_spots').insert(rec)
    if (!error) inserted++
    else if (error.code === '23505' || error.message.toLowerCase().includes('duplicate key')) {
      skipped++
    } else errors++
  }
  return { inserted, skipped, errors }
}

// --- AQICN ----------------------------------------------------------------

interface AirRecord {
  city: string
  station_name: string | null
  aqi: number | null
  dominant_pollutant: string | null
  pm25: number | null
  pm10: number | null
  o3: number | null
  no2: number | null
  co: number | null
  observed_at: string
}

async function tryAqicnFeed(
  feedPath: string,
  token: string,
): Promise<{ data: Record<string, unknown> | null; err: string | null }> {
  const url = `https://api.waqi.info/feed/${feedPath}/?token=${token}`
  const resp = await requestWithRetry(url, { maxRetries: 3, timeoutMs: 15_000 })
  if (resp === null) return { data: null, err: 'Falha de conexao apos retries' }
  try {
    const data = (await resp.json()) as Record<string, unknown>
    if (data['status'] !== 'ok') {
      const msg = data['data'] ?? data['message'] ?? 'unknown'
      return { data: null, err: `status=${data['status']} msg=${msg}` }
    }
    return { data, err: null }
  } catch (e) {
    return { data: null, err: `Erro ao parsear JSON: ${(e as Error).message}` }
  }
}

function parseAqicnData(cityId: string, data: Record<string, unknown>): AirRecord {
  const d = data['data'] as Record<string, unknown>
  const iaqi = (d['iaqi'] ?? {}) as Record<string, { v?: number } | undefined>
  const pollutant = (name: string): number | null => {
    const entry = iaqi[name]
    return entry && entry.v !== undefined ? Number(entry.v) : null
  }
  const rawAqi = d['aqi']
  const time = (d['time'] ?? {}) as Record<string, unknown>
  return {
    city: cityId,
    station_name: ((d['city'] ?? {}) as Record<string, unknown>)['name'] as string | null,
    aqi: rawAqi !== '-' && rawAqi !== undefined ? Math.trunc(Number(rawAqi)) : null,
    dominant_pollutant: (d['dominentpol'] as string) ?? null,
    pm25: pollutant('pm25'),
    pm10: pollutant('pm10'),
    o3: pollutant('o3'),
    no2: pollutant('no2'),
    co: pollutant('co'),
    observed_at: (time['iso'] as string) || new Date().toISOString(),
  }
}

async function fetchAqicn(token: string): Promise<AirRecord[]> {
  const records: AirRecord[] = []
  for (const city of CIDADES_AR) {
    try {
      let { data, err } = await tryAqicnFeed(city.slug, token)
      if (data === null) {
        console.warn(`AQICN ${city.id}: feed/${city.slug} falhou (${err}), tentando geo`)
        const geo = CIDADES_AR_GEO[city.id]
        if (!geo) continue
        const geoResult = await tryAqicnFeed(`geo:${geo.lat};${geo.lon}`, token)
        data = geoResult.data
        if (data === null) {
          console.warn(`AQICN ${city.id}: geo tambem falhou (${geoResult.err})`)
          continue
        }
      }
      records.push(parseAqicnData(city.id, data))
    } catch (e) {
      console.warn(`AQICN ${city.id}: ${(e as Error).message}`)
    }
  }
  return records
}

// --- ANA ------------------------------------------------------------------

interface RiverRecord {
  station_code: string
  station_name: string
  river_name: string
  municipality: string
  latitude: number
  longitude: number
  level_cm: number | null
  flow_m3s: number | null
  alert_level: string
  observed_at: string
}

function getAlertLevel(stationCode: string, levelCm: number | null): string {
  if (levelCm === null) return 'normal'
  const cotas = COTAS_ALERTA[stationCode] ?? { attention: 200, alert: 400, emergency: 600 }
  if (levelCm >= cotas.emergency) return 'emergency'
  if (levelCm >= cotas.alert) return 'alert'
  if (levelCm >= cotas.attention) return 'attention'
  return 'normal'
}

/**
 * Extrai os blocos DadosHidrometereologicos do XML da ANA e devolve, do
 * ULTIMO bloco, nivel/vazao/datahora pelo mesmo casamento por substring de
 * tag do Python ('nivel' | 'vazao' | 'datahora' ou 'data').
 */
function parseAnaXml(xml: string): { nivel: string | null; vazao: string | null; dataHora: string | null } | null {
  if (!xml.trimStart().startsWith('<')) return null
  const blocks = [...xml.matchAll(/<DadosHidrometereologicos[\s>][\s\S]*?<\/DadosHidrometereologicos>/gi)]
  if (blocks.length === 0) return null
  const last = blocks[blocks.length - 1][0]

  let nivel: string | null = null
  let vazao: string | null = null
  let dataHora: string | null = null
  for (const m of last.matchAll(/<([\w:]+)[^>]*>([^<]*)<\/\1>/g)) {
    const tagLower = m[1].toLowerCase().split(':').pop() ?? ''
    const text = m[2]
    if (tagLower.includes('nivel')) nivel = text
    else if (tagLower.includes('vazao')) vazao = text
    else if (tagLower.includes('datahora') || tagLower.includes('data')) dataHora = text
  }
  return { nivel, vazao, dataHora }
}

async function fetchAnaRivers(): Promise<RiverRecord[]> {
  const records: RiverRecord[] = []
  const ddmmyyyy = (d: Date) => {
    const iso = d.toISOString().slice(0, 10)
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  }
  const now = new Date()
  const dateEnd = ddmmyyyy(now)
  const dateStart = ddmmyyyy(new Date(now.getTime() - 86_400_000))

  for (const est of ESTACOES_RIOS_PR) {
    const base: RiverRecord = {
      station_code: est.code,
      station_name: est.name,
      river_name: est.river,
      municipality: est.municipality,
      latitude: est.lat,
      longitude: est.lon,
      level_cm: null,
      flow_m3s: null,
      alert_level: 'normal',
      observed_at: new Date().toISOString(),
    }
    try {
      const url =
        `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos` +
        `?codEstacao=${est.code}&dataInicio=${dateStart}&dataFim=${dateEnd}`
      const resp = await requestWithRetry(url, { maxRetries: 3, timeoutMs: 30_000 })
      if (resp === null || resp.status !== 200) {
        console.warn(`ANA ${est.code}: ${resp === null ? 'sem conexao' : `HTTP ${resp.status}`} (mantida a ultima leitura)`)
        continue
      }
      const parsed = parseAnaXml(await resp.text())
      if (parsed === null) {
        console.warn(`ANA ${est.code}: XML sem dados (mantida a ultima leitura)`)
        continue
      }
      const levelRaw = parsed.nivel && parsed.nivel.trim() ? Number(parsed.nivel) : null
      const levelCm = Number.isFinite(levelRaw as number) ? levelRaw : null
      const observedAt = dataHoraAnaIso(parsed.dataHora)
      if (levelCm === null || observedAt === null) {
        console.warn(`ANA ${est.code}: leitura sem nivel ou sem data (mantida a ultima leitura)`)
        continue
      }
      const flow = parsed.vazao && parsed.vazao.trim() ? Number(parsed.vazao) : null
      records.push({
        ...base,
        level_cm: levelCm,
        flow_m3s: Number.isFinite(flow as number) ? flow : null,
        alert_level: getAlertLevel(est.code, levelCm),
        observed_at: observedAt,
      })
    } catch (e) {
      console.warn(`ANA ${est.code}: ${(e as Error).message} (mantida a ultima leitura)`)
    }
  }
  return records
}

/** Upsert com fallback delete+insert em erro de constraint (padrao do Python). */
async function upsertWithFallback(
  client: SupabaseClient,
  table: string,
  records: Record<string, unknown>[],
  conflictField: string,
): Promise<{ ok: boolean; msg: string | null }> {
  const { error } = await client.from(table).upsert(records, { onConflict: conflictField })
  if (!error) return { ok: true, msg: null }
  if (error.message.toLowerCase().includes('constraint')) {
    for (const rec of records) {
      await client.from(table).delete().eq(conflictField, rec[conflictField] as string)
    }
    const { error: insError } = await client.from(table).insert(records)
    if (!insError) return { ok: true, msg: 'upsert_fallback' }
    return { ok: false, msg: `Delete+insert falhou: ${insError.message}` }
  }
  return { ok: false, msg: error.message }
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'ambiente', async (client: SupabaseClient): Promise<RunResult> => {
    const firmsKey = Deno.env.get('NASA_FIRMS_KEY') ?? 'DEMO_KEY'
    const waqiToken = Deno.env.get('WAQI_TOKEN') ?? 'demo'
    const errors: string[] = []

    // 1/3 FIRMS
    let firmsCount = 0
    let firmsForaDoPr = 0
    let firmsStats = { inserted: 0, skipped: 0, errors: 0 }
    let backfill = { atualizados: 0, apagados: 0, erros: 0 }
    try {
      if (firmsKey === 'DEMO_KEY') console.warn('FIRMS rodando com DEMO_KEY')
      const { spots, foraDoPr } = await fetchFirms(firmsKey)
      firmsCount = spots.length
      firmsForaDoPr = foraDoPr
      if (spots.length > 0) {
        firmsStats = await insertFireSpotsDedupe(client, spots)
        if (firmsStats.errors > 0) errors.push(`FIRMS insert: ${firmsStats.errors} records falharam`)
        // Limpa focos com mais de 30 dias
        const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
        const { error: delError } = await client.from('fire_spots').delete().lt('acq_date', cutoff)
        if (delError) console.warn(`limpeza fire_spots: ${delError.message}`)
      }
      backfill = await backfillFireSpots(client)
      if (backfill.erros > 0) errors.push(`FIRMS backfill: ${backfill.erros} erro(s)`)
    } catch (e) {
      errors.push(`FIRMS: ${(e as Error).message}`)
    }

    // 2/3 AQICN
    let aqicnCount = 0
    try {
      if (waqiToken === 'demo') console.warn('AQICN rodando com token demo')
      const aqRecords = await fetchAqicn(waqiToken)
      aqicnCount = aqRecords.length
      if (aqRecords.length > 0) {
        const { ok, msg } = await upsertWithFallback(
          client,
          'air_quality',
          aqRecords as unknown as Record<string, unknown>[],
          'city',
        )
        if (!ok) errors.push(`AQICN insert: ${msg}`)
      }
    } catch (e) {
      errors.push(`AQICN: ${(e as Error).message}`)
    }

    // 3/3 ANA
    let anaCount = 0
    try {
      const rivers = await fetchAnaRivers()
      anaCount = rivers.length
      if (rivers.length > 0) {
        const { ok, msg } = await upsertWithFallback(
          client,
          'river_levels',
          rivers as unknown as Record<string, unknown>[],
          'station_code',
        )
        if (!ok) errors.push(`ANA insert: ${msg}`)
      }
    } catch (e) {
      errors.push(`ANA: ${(e as Error).message}`)
    }

    const status =
      errors.length === 0
        ? 'success'
        : firmsCount > 0 || aqicnCount > 0 || anaCount > 0
          ? 'partial'
          : 'error'
    if (status === 'error') throw new Error(errors.join(' | '))

    return {
      status,
      firms_spots: firmsCount,
      firms_inserted: firmsStats.inserted,
      firms_deduped: firmsStats.skipped,
      firms_fora_do_pr: firmsForaDoPr,
      firms_backfill_atualizados: backfill.atualizados,
      firms_backfill_apagados: backfill.apagados,
      aqicn_cities: aqicnCount,
      ana_stations: anaCount,
      errors,
    }
  })
)
