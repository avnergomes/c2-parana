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
// de entrar como zero fantasma (Option 4 do script). Pesos, thresholds e
// classificacao portados 1:1 -- qualquer ajuste de formula e mudanca de
// produto, nao de porte.
//
// Municipios: _shared/pr_municipios.ts substitui o GeoJSON local do Python.
// O matching por nome (focos e rios) replica o par lower/sem-acentos.

import { runEtl, batchUpsert, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { PR_MUNICIPIOS, buildNameLookup, stripAccentsLower } from '../_shared/pr_municipios.ts'

const W_CLIMA = 0.25
const W_SAUDE = 0.25
const W_AMBIENTE = 0.20
const W_HIDRO = 0.15
const W_AR = 0.15

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

const round2 = (v: number) => Math.round(v * 100) / 100
const round1 = (v: number) => Math.round(v * 10) / 10
const utcIsoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function matchNameToIbge(name: string, lookup: Map<string, string>): string | null {
  if (!name) return null
  return lookup.get(name.toLowerCase().trim()) ?? lookup.get(stripAccentsLower(name)) ?? null
}

// --- Fetchers -------------------------------------------------------------

interface ClimateEntry {
  temperature: number | null
  humidity: number | null
  precipitation_72h: number
}

async function fetchClimateData(client: SupabaseClient): Promise<Map<string, ClimateEntry>> {
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
  }[]) {
    if (!rec.ibge_code || byMuni.has(rec.ibge_code)) continue
    byMuni.set(rec.ibge_code, {
      temperature: rec.temperature,
      humidity: rec.humidity,
      precipitation_72h: 0,
    })
  }

  const cutoff72h = new Date(Date.now() - 72 * 3600_000).toISOString()
  const { data: precip, error: precipErr } = await client
    .from('climate_data')
    .select('ibge_code,precipitation,observed_at')
    .gte('observed_at', cutoff72h)
    .not('precipitation', 'is', null)
    .limit(5000)
  if (precipErr) throw new Error(`climate_data precip: ${precipErr.message}`)
  const precipSum = new Map<string, number>()
  for (const rec of (precip ?? []) as { ibge_code: string | null; precipitation: number | null }[]) {
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

async function fetchDengueData(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client
    .from('dengue_data')
    .select('ibge_code,alert_level,epidemiological_week,year')
    .order('year', { ascending: false })
    .order('epidemiological_week', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`dengue_data: ${error.message}`)
  const byMuni = new Map<string, number>()
  for (const rec of (data ?? []) as { ibge_code: string | null; alert_level: number | null }[]) {
    if (rec.ibge_code && !byMuni.has(rec.ibge_code)) {
      byMuni.set(rec.ibge_code, Number(rec.alert_level ?? 0))
    }
  }
  return byMuni
}

async function fetchFireSpots(client: SupabaseClient): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await client
    .from('fire_spots')
    .select('municipality,acq_date')
    .gte('acq_date', cutoff)
    .limit(5000)
  if (error) throw new Error(`fire_spots: ${error.message}`)
  const counts = new Map<string, number>()
  for (const rec of (data ?? []) as { municipality: string | null }[]) {
    if (rec.municipality) counts.set(rec.municipality, (counts.get(rec.municipality) ?? 0) + 1)
  }
  return counts
}

async function fetchRiverLevels(client: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await client
    .from('river_levels')
    .select('station_code,municipality,alert_level')
  if (error) throw new Error(`river_levels: ${error.message}`)
  const priority: Record<string, number> = { normal: 0, attention: 1, alert: 2, emergency: 3 }
  const byMuni = new Map<string, string>()
  for (const rec of (data ?? []) as { municipality: string | null; alert_level: string | null }[]) {
    if (!rec.municipality) continue
    const level = rec.alert_level ?? 'normal'
    const existing = byMuni.get(rec.municipality)
    if (existing === undefined) byMuni.set(rec.municipality, level)
    else if ((priority[level] ?? 0) > (priority[existing] ?? 0)) byMuni.set(rec.municipality, level)
  }
  return byMuni
}

async function fetchCemadenHydroScores(client: SupabaseClient): Promise<Map<string, number>> {
  const cutoff = utcIsoZ(new Date(Date.now() - 3 * 86_400_000))
  const nowIso = utcIsoZ(new Date())
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

// --- Calculos de risco (0-100), 1:1 com o Python --------------------------

function calcRClima(
  temperature: number | null,
  humidity: number | null,
  precipitation72h: number,
): [number, boolean] {
  const scores: number[] = []
  if (temperature !== null && temperature !== undefined) {
    scores.push(temperature > 40 ? 100 : temperature > 35 ? 50 : 0)
  }
  if (humidity !== null && humidity !== undefined) {
    scores.push(humidity < 30 ? 50 : 0)
  }
  if (precipitation72h !== null && precipitation72h > 0) {
    scores.push(
      precipitation72h > 100 ? 100 : precipitation72h > 50 ? 60 : precipitation72h > 20 ? 25 : 0,
    )
  }
  if (scores.length === 0) return [0, false]
  return [scores.reduce((a, b) => a + b, 0) / scores.length, true]
}

function calcRSaude(alertLevel: number): [number, boolean] {
  const mapping: Record<number, number> = { 1: 25, 2: 50, 3: 75, 4: 100 }
  const level = Math.trunc(alertLevel || 0)
  if (level in mapping) return [mapping[level], true]
  return [0, false]
}

function calcRAmbiente(fireCount: number): [number, boolean] {
  if (fireCount <= 0) return [0, true]
  if (fireCount <= 3) return [15, true]
  if (fireCount <= 15) return [40, true]
  if (fireCount <= 50) return [70, true]
  return [100, true]
}

function calcRHidro(alertLevel: string, hasStation: boolean): [number, boolean] {
  const mapping: Record<string, number> = { normal: 0, attention: 33, alert: 66, emergency: 100 }
  return [mapping[alertLevel || 'normal'] ?? 0, hasStation]
}

function calcRAr(aqi: number | undefined): [number, boolean] {
  if (aqi === undefined || aqi === null) return [0, false]
  if (aqi <= 50) return [0, true]
  if (aqi <= 100) return [25, true]
  if (aqi <= 150) return [50, true]
  if (aqi <= 200) return [75, true]
  return [100, true]
}

function classifyRiskLevel(irtc: number): string {
  if (irtc <= 25) return 'baixo'
  if (irtc <= 50) return 'médio'
  if (irtc <= 75) return 'alto'
  return 'crítico'
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'irtc', async (client: SupabaseClient): Promise<RunResult> => {
    const errors: string[] = []
    const lookup = buildNameLookup()

    let climateData = new Map<string, ClimateEntry>()
    try {
      climateData = await fetchClimateData(client)
    } catch (e) {
      errors.push(`climate_data: ${(e as Error).message}`)
    }

    let dengueData = new Map<string, number>()
    try {
      dengueData = await fetchDengueData(client)
    } catch (e) {
      errors.push(`dengue_data: ${(e as Error).message}`)
    }

    let fireData = new Map<string, number>()
    try {
      fireData = await fetchFireSpots(client)
    } catch (e) {
      errors.push(`fire_spots: ${(e as Error).message}`)
    }

    let riverData = new Map<string, string>()
    try {
      riverData = await fetchRiverLevels(client)
    } catch (e) {
      errors.push(`river_levels: ${(e as Error).message}`)
    }
    const cemadenHydro = await fetchCemadenHydroScores(client)

    let airData = new Map<string, number>()
    try {
      airData = await fetchAirQuality(client)
    } catch (e) {
      errors.push(`air_quality: ${(e as Error).message}`)
    }

    const now = new Date().toISOString()
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

      // R_ambiente: match direto pelo nome oficial, senao varre os nomes do
      // FIRMS reconciliando via lookup (mesma ordem de busca do Python).
      let fireCount = fireData.get(munName) ?? 0
      if (fireCount === 0) {
        for (const [fireMun, count] of fireData) {
          if (matchNameToIbge(fireMun, lookup) === ibgeCode) {
            fireCount = count
            break
          }
        }
      }
      const [rAmbiente, rAmbienteHas] = calcRAmbiente(fireCount)

      // R_hidro: max(ANA, CEMADEN hidro)
      let riverAlert = riverData.get(munName)
      let hasStation = riverAlert !== undefined
      if (!hasStation) {
        for (const [riverMun, alert] of riverData) {
          if (matchNameToIbge(riverMun, lookup) === ibgeCode) {
            riverAlert = alert
            hasStation = true
            break
          }
        }
      }
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

      // IRTC normalizado pela cobertura
      const domains: [number, number, boolean, string][] = [
        [W_CLIMA, rClima, rClimaHas, 'clima'],
        [W_SAUDE, rSaude, rSaudeHas, 'saude'],
        [W_AMBIENTE, rAmbiente, rAmbienteHas, 'ambiente'],
        [W_HIDRO, rHidro, rHidroHas, 'hidro'],
        [W_AR, rAr, rArHas, 'ar'],
      ]
      const available = domains.filter(([, , has]) => has)

      let irtc = 0
      let dataCoverage = 0
      if (available.length > 0) {
        const totalWeight = available.reduce((acc, [w]) => acc + w, 0)
        irtc = round2(available.reduce((acc, [w, s]) => acc + w * s, 0) / totalWeight)
        dataCoverage = round2(totalWeight)
      }

      let maxDomainScore = 0
      let dominantDomain: string | null = null
      for (const [, score, has, name] of domains) {
        if (has && score > maxDomainScore) {
          maxDomainScore = score
          dominantDomain = name
        }
      }
      if (dominantDomain === null && available.length > 0) {
        dominantDomain = available[0][3]
      }

      const riskLevel = classifyRiskLevel(irtc)
      riskDistribution[riskLevel] = (riskDistribution[riskLevel] ?? 0) + 1

      irtcRecords.push({
        ibge_code: ibgeCode,
        municipality: munName,
        risk_clima: round2(rClima),
        risk_saude: round2(rSaude),
        risk_ambiente: round2(rAmbiente),
        risk_hidro: round2(rHidro),
        risk_ar: round2(rAr),
        irtc_score: irtc,
        risk_level: riskLevel,
        data_coverage: dataCoverage,
        max_domain_score: maxDomainScore,
        dominant_domain: dominantDomain,
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
