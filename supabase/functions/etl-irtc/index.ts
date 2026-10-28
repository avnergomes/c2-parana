// supabase/functions/etl-irtc/index.ts
// Indice de Risco Territorial Composto para os 399 municipios do PR.
//
// Porte Deno de scripts/etl_irtc.py (a especificacao). DB->DB: combina
// clima (INMET/Open-Meteo), dengue (InfoDengue), focos (FIRMS), rios
// (ANA + CEMADEN hidro) e ar (AQICN) num indice 0-100 por municipio.
//
//   IRTC = 0.25*R_clima + 0.25*R_saude + 0.20*R_ambiente + 0.15*R_hidro + 0.15*R_ar
//
// normalizado pela cobertura: dominio sem dado sai da media ponderada em vez
// de entrar como zero fantasma (Option 4 do script). Regras puras em calc.ts.
//
// v1.1 (2026-10, mesma formula e mesmos pesos; correcoes de leitura):
//   - focos contados por ibge_code (ponto-no-poligono no etl-ambiente), com
//     paginacao: o teto de 1000 linhas do PostgREST truncava a contagem;
//   - rio so com leitura de nivel real de ate 12 h (antes uma falha da ANA
//     virava 'normal' e contava como dado);
//   - dengue so com semana epidemiologica de ate 28 dias; clima de ate 36 h;
//   - has_* por dominio e versao_metodo gravados (migration 054), para a
//     ficha mostrar "sem dado" em vez de 0;
//   - classe pelo corte ">= limite", igual aos paineis.
//
// Municipios: _shared/pr_municipios.ts substitui o GeoJSON local do Python.
// O matching por nome (rios e focos antigos sem ibge_code) replica o par
// lower/sem-acentos.

import { runEtl, batchUpsert, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { PR_MUNICIPIOS, buildNameLookup, stripAccentsLower } from '../_shared/pr_municipios.ts'
import {
  CLIMA_MAX_IDADE_H,
  RIO_MAX_IDADE_H,
  VERSAO_METODO,
  W_AMBIENTE,
  W_AR,
  W_CLIMA,
  W_HIDRO,
  W_SAUDE,
  calcRAmbiente,
  calcRAr,
  calcRClima,
  calcRHidro,
  calcRSaude,
  combinarDominios,
  leituraFresca,
  semanaEpiFresca,
} from './calc.ts'

const CITY_TO_IBGE: Record<string, string> = {
  curitiba: '4106902',
  londrina: '4113700',
  maringa: '4115200',
  foz: '4108304',
  cascavel: '4104808',
  'ponta-grossa': '4119905',
  'sao-jose-dos-pinhais': '4125506',
  guarapuava: '4109401',
  umuarama: '4128104',
  toledo: '4127700',
  paranagua: '4118204',
  apucarana: '4101408',
}

const PAGINA = 1000
const MAX_PAGINAS = 50

const round2 = (v: number) => Math.round(v * 100) / 100
const round1 = (v: number) => Math.round(v * 10) / 10
const utcIsoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function matchNameToIbge(name: string, lookup: Map<string, string>): string | null {
  if (!name) return null
  return lookup.get(name.toLowerCase().trim()) ?? lookup.get(stripAccentsLower(name)) ?? null
}

/**
 * Le todas as paginas de uma consulta. O PostgREST corta cada resposta em
 * max_rows (1000), entao `limit(5000)` nunca trazia mais de 1000 linhas.
 */
async function lerTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  rotulo: string,
): Promise<T[]> {
  const linhas: T[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * PAGINA
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) throw new Error(`${rotulo}: ${error.message}`)
    const lote = (data ?? []) as T[]
    linhas.push(...lote)
    if (lote.length < PAGINA) return linhas
  }
  console.warn(`${rotulo}: parou em ${MAX_PAGINAS} paginas`)
  return linhas
}

// --- Fetchers -------------------------------------------------------------

interface ClimateEntry {
  temperature: number | null
  humidity: number | null
  precipitation_72h: number
}

async function fetchClimateData(client: SupabaseClient, agora: Date): Promise<Map<string, ClimateEntry>> {
  const byMuni = new Map<string, ClimateEntry>()

  const { data: latest, error: latestErr } = await client
    .from('climate_data')
    .select('ibge_code,temperature,humidity,observed_at')
    .order('observed_at', { ascending: false })
    .limit(500)
  if (latestErr) throw new Error(`climate_data latest: ${latestErr.message}`)
  for (const rec of (latest ?? []) as {
    ibge_code: string | null
    temperature: number | null
    humidity: number | null
    observed_at: string | null
  }[]) {
    if (!rec.ibge_code || byMuni.has(rec.ibge_code)) continue
    // Leitura velha (estacao parada) nao conta: o municipio fica sem dado.
    const fresca = leituraFresca(rec.observed_at, agora, CLIMA_MAX_IDADE_H)
    byMuni.set(rec.ibge_code, {
      temperature: fresca ? rec.temperature : null,
      humidity: fresca ? rec.humidity : null,
      precipitation_72h: 0,
    })
  }

  const cutoff72h = new Date(agora.getTime() - 72 * 3600_000).toISOString()
  const precip = await lerTudo<{ ibge_code: string | null; precipitation: number | null }>(
    (de, ate) =>
      client
        .from('climate_data')
        .select('id,ibge_code,precipitation')
        .gte('observed_at', cutoff72h)
        .not('precipitation', 'is', null)
        .order('id')
        .range(de, ate),
    'climate_data precip',
  )
  const precipSum = new Map<string, number>()
  for (const rec of precip) {
    if (rec.ibge_code && typeof rec.precipitation === 'number') {
      precipSum.set(rec.ibge_code, (precipSum.get(rec.ibge_code) ?? 0) + rec.precipitation)
    }
  }
  for (const [ibge, total] of precipSum) {
    const entry = byMuni.get(ibge) ?? { temperature: null, humidity: null, precipitation_72h: 0 }
    entry.precipitation_72h = round1(total)
    byMuni.set(ibge, entry)
  }
  return byMuni
}

async function fetchDengueData(client: SupabaseClient, agora: Date): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('dengue_data')
    .select('ibge_code,alert_level,epidemiological_week,year')
    .order('year', { ascending: false })
    .order('epidemiological_week', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`dengue_data: ${error.message}`)
  const byMuni = new Map<string, number>()
  const vistos = new Set<string>()
  for (const rec of (data ?? []) as {
    ibge_code: string | null
    alert_level: number | null
    epidemiological_week: number | null
    year: number | null
  }[]) {
    if (!rec.ibge_code || vistos.has(rec.ibge_code)) continue
    vistos.add(rec.ibge_code)
    // Semana mais recente velha demais (ETL parado): sem dado, nao o nivel antigo.
    if (!semanaEpiFresca(Number(rec.year), Number(rec.epidemiological_week), agora)) continue
    byMuni.set(rec.ibge_code, Number(rec.alert_level ?? 0))
  }
  return byMuni
}

/** Focos dos ultimos 30 dias por ibge_code (focos antigos sem ibge caem no nome). */
async function fetchFireCounts(
  client: SupabaseClient,
  agora: Date,
  lookup: Map<string, string>,
): Promise<Map<string, number>> {
  const cutoff = new Date(agora.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const linhas = await lerTudo<{ ibge_code: string | null; municipality: string | null }>(
    (de, ate) =>
      client
        .from('fire_spots')
        .select('id,ibge_code,municipality')
        .gte('acq_date', cutoff)
        .order('id')
        .range(de, ate),
    'fire_spots',
  )
  const counts = new Map<string, number>()
  for (const rec of linhas) {
    const ibge = rec.ibge_code || (rec.municipality ? matchNameToIbge(rec.municipality, lookup) : null)
    if (ibge) counts.set(ibge, (counts.get(ibge) ?? 0) + 1)
  }
  return counts
}

/** Pior alerta por municipio entre as estacoes da ANA com leitura real recente. */
async function fetchRiverLevels(
  client: SupabaseClient,
  agora: Date,
  lookup: Map<string, string>,
): Promise<Map<string, string>> {
  const { data, error } = await client
    .from('river_levels')
    .select('station_code,municipality,alert_level,level_cm,observed_at')
  if (error) throw new Error(`river_levels: ${error.message}`)
  const priority: Record<string, number> = { normal: 0, attention: 1, alert: 2, emergency: 3 }
  const byIbge = new Map<string, string>()
  for (const rec of (data ?? []) as {
    municipality: string | null
    alert_level: string | null
    level_cm: number | null
    observed_at: string | null
  }[]) {
    if (!rec.municipality) continue
    if (rec.level_cm === null || rec.level_cm === undefined) continue
    if (!leituraFresca(rec.observed_at, agora, RIO_MAX_IDADE_H)) continue
    const ibge = matchNameToIbge(rec.municipality, lookup)
    if (!ibge) continue
    const level = rec.alert_level ?? 'normal'
    const existing = byIbge.get(ibge)
    if (existing === undefined || (priority[level] ?? 0) > (priority[existing] ?? 0)) byIbge.set(ibge, level)
  }
  return byIbge
}

async function fetchCemadenHydroScores(client: SupabaseClient, agora: Date): Promise<Map<string, number>> {
  const cutoff = utcIsoZ(new Date(agora.getTime() - 3 * 86_400_000))
  const nowIso = utcIsoZ(agora)
  const { data, error } = await client
    .from('cemaden_alerts')
    .select('ibge_code,alert_type,severity,expires_at,issued_at')
    .gte('issued_at', cutoff)
    .in('alert_type', ['hidrologico', 'alagamento', 'inundacao', 'enxurrada', 'movimento_massa'])
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1000)
  if (error) {
    console.warn(`cemaden_alerts: ${error.message}`)
    return new Map()
  }
  const severityMap: Record<string, number> = {
    observacao: 25,
    atencao: 50,
    alerta: 75,
    alerta_maximo: 100,
  }
  const byIbge = new Map<string, number>()
  for (const rec of (data ?? []) as { ibge_code: string | null; severity: string | null }[]) {
    if (!rec.ibge_code) continue
    const score = severityMap[rec.severity ?? ''] ?? 0
    if (score > (byIbge.get(rec.ibge_code) ?? 0)) byIbge.set(rec.ibge_code, score)
  }
  return byIbge
}

async function fetchAirQuality(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client.from('air_quality').select('city,aqi')
  if (error) throw new Error(`air_quality: ${error.message}`)
  const byCity = new Map<string, number>()
  for (const rec of (data ?? []) as { city: string | null; aqi: number | null }[]) {
    if (rec.city && rec.aqi !== null && rec.aqi !== undefined) byCity.set(rec.city, rec.aqi)
  }
  return byCity
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'irtc', async (client: SupabaseClient): Promise<RunResult> => {
    const errors: string[] = []
    const lookup = buildNameLookup()
    const agora = new Date()

    let climateData = new Map<string, ClimateEntry>()
    try {
      climateData = await fetchClimateData(client, agora)
    } catch (e) {
      errors.push(`climate_data: ${(e as Error).message}`)
    }

    let dengueData = new Map<string, number>()
    try {
      dengueData = await fetchDengueData(client, agora)
    } catch (e) {
      errors.push(`dengue_data: ${(e as Error).message}`)
    }

    let fireData = new Map<string, number>()
    let fireOk = true
    try {
      fireData = await fetchFireCounts(client, agora, lookup)
    } catch (e) {
      fireOk = false
      errors.push(`fire_spots: ${(e as Error).message}`)
    }

    let riverData = new Map<string, string>()
    try {
      riverData = await fetchRiverLevels(client, agora, lookup)
    } catch (e) {
      errors.push(`river_levels: ${(e as Error).message}`)
    }
    const cemadenHydro = await fetchCemadenHydroScores(client, agora)

    let airData = new Map<string, number>()
    try {
      airData = await fetchAirQuality(client)
    } catch (e) {
      errors.push(`air_quality: ${(e as Error).message}`)
    }

    const now = agora.toISOString()
    const irtcRecords: Record<string, unknown>[] = []
    const riskDistribution: Record<string, number> = {}

    for (const [ibgeCode, munName] of PR_MUNICIPIOS) {
      const clima = climateData.get(ibgeCode)
      const [rClima, rClimaHas] = calcRClima(
        clima?.temperature ?? null,
        clima?.humidity ?? null,
        clima?.precipitation_72h ?? 0,
      )

      const [rSaude, rSaudeHas] = calcRSaude(dengueData.get(ibgeCode) ?? 0)

      const [rAmbiente, rAmbienteHas] = calcRAmbiente(fireData.get(ibgeCode) ?? 0, fireOk)

      // R_hidro: max(ANA, CEMADEN hidro)
      const riverAlert = riverData.get(ibgeCode)
      const hasStation = riverAlert !== undefined
      const [rHidroAna] = calcRHidro(riverAlert ?? 'normal', hasStation)
      const cemadenScore = cemadenHydro.get(ibgeCode) ?? 0
      const rHidro = Math.max(rHidroAna, cemadenScore)
      const rHidroHas = hasStation || cemadenScore > 0

      // R_ar: mapeamento AQICN city -> ibge
      let rAr = 0
      let rArHas = false
      for (const [cityId, cityIbge] of Object.entries(CITY_TO_IBGE)) {
        if (cityIbge === ibgeCode) {
          ;[rAr, rArHas] = calcRAr(airData.get(cityId))
          break
        }
      }

      const r = combinarDominios([
        { peso: W_CLIMA, score: rClima, temDado: rClimaHas, nome: 'clima' },
        { peso: W_SAUDE, score: rSaude, temDado: rSaudeHas, nome: 'saude' },
        { peso: W_AMBIENTE, score: rAmbiente, temDado: rAmbienteHas, nome: 'ambiente' },
        { peso: W_HIDRO, score: rHidro, temDado: rHidroHas, nome: 'hidro' },
        { peso: W_AR, score: rAr, temDado: rArHas, nome: 'ar' },
      ])
      riskDistribution[r.riskLevel] = (riskDistribution[r.riskLevel] ?? 0) + 1

      irtcRecords.push({
        ibge_code: ibgeCode,
        municipality: munName,
        risk_clima: round2(rClima),
        risk_saude: round2(rSaude),
        risk_ambiente: round2(rAmbiente),
        risk_hidro: round2(rHidro),
        risk_ar: round2(rAr),
        irtc_score: r.irtc,
        risk_level: r.riskLevel,
        data_coverage: r.dataCoverage,
        max_domain_score: r.maxDomainScore,
        dominant_domain: r.dominantDomain,
        has_clima: rClimaHas,
        has_saude: rSaudeHas,
        has_ambiente: rAmbienteHas,
        has_hidro: rHidroHas,
        has_ar: rArHas,
        versao_metodo: VERSAO_METODO,
        calculated_at: now,
      })
    }

    const result = await batchUpsert(client, 'irtc_scores', irtcRecords, 'ibge_code', 200)
    if (result.inserted === 0 && irtcRecords.length > 0) {
      throw new Error(`irtc_scores upsert: todos os ${irtcRecords.length} registros falharam`)
    }

    const status =
      errors.length > 0 || result.errors > 0 ? 'partial' : ('success' as const)
    return {
      status,
      versao_metodo: VERSAO_METODO,
      municipalities_calculated: irtcRecords.length,
      upserted: result.inserted,
      failed_rows: result.errors,
      risk_distribution: riskDistribution,
      data_sources: {
        climate_municipalities: climateData.size,
        dengue_municipalities: dengueData.size,
        fire_municipalities: fireData.size,
        river_municipalities: riverData.size,
        cemaden_hydro: cemadenHydro.size,
        air_cities: airData.size,
      },
      errors,
    }
  })
)
