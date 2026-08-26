// supabase/functions/etl-saude/index.ts
// InfoDengue por municipio do PR (Fase 0 original do projeto).
//
// Porte Deno de scripts/etl_saude.py (a especificacao). Busca ate 52 semanas
// por municipio no alertcity do InfoDengue e faz upsert idempotente em
// dengue_data (ibge_code,year,epidemiological_week). Rate limiting adaptativo
// com circuit breaker, como o Python (2 workers, delay base 100 ms).
//
// Modos (query params, previstos no plano de migracao):
//   ?mode=fast (default)  -> Tier 1, top 50 municipios (~80% da populacao)
//   ?mode=full            -> 399 municipios; combine com ?batch=1|2|3 para
//                            fatiar em 3 lotes de ~133 e caber no wall-clock
//                            de Edge Function (3 schedules em offset no
//                            pg_cron, padrao da migration 031 do aviacao).
//   ?mode=full sem batch  -> os 399 de uma vez (usar so em teste manual).

import { runEtl, sleep, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { PR_MUNICIPIOS } from '../_shared/pr_municipios.ts'

const CURRENT_YEAR = new Date().getFullYear()
const MAX_WORKERS = 2

interface Municipio {
  ibge: string
  name: string
}

// Top 50 municipios PR por populacao (identico ao TIER1 do Python)
const TIER1_MUNICIPIOS: Municipio[] = [
  { ibge: '4106902', name: 'Curitiba' },
  { ibge: '4113700', name: 'Londrina' },
  { ibge: '4115200', name: 'Maringa' },
  { ibge: '4119905', name: 'Ponta Grossa' },
  { ibge: '4104808', name: 'Cascavel' },
  { ibge: '4108304', name: 'Foz do Iguacu' },
  { ibge: '4105508', name: 'Colombo' },
  { ibge: '4109401', name: 'Guarapuava' },
  { ibge: '4118204', name: 'Paranagua' },
  { ibge: '4101804', name: 'Araucaria' },
  { ibge: '4127700', name: 'Toledo' },
  { ibge: '4101307', name: 'Apucarana' },
  { ibge: '4119152', name: 'Pinhais' },
  { ibge: '4104402', name: 'Campo Mourao' },
  { ibge: '4128104', name: 'Umuarama' },
  { ibge: '4118601', name: 'Paranavai' },
  { ibge: '4107652', name: 'Fazenda Rio Grande' },
  { ibge: '4100400', name: 'Almirante Tamandare' },
  { ibge: '4103404', name: 'Cambe' },
  { ibge: '4125506', name: 'Sao Jose dos Pinhais' },
  { ibge: '4103602', name: 'Campo Largo' },
  { ibge: '4120200', name: 'Rolandia' },
  { ibge: '4106571', name: 'Cianorte' },
  { ibge: '4107207', name: 'Cornelio Procopio' },
  { ibge: '4110706', name: 'Irati' },
  { ibge: '4128302', name: 'Uniao da Vitoria' },
  { ibge: '4113601', name: 'Lapa' },
  { ibge: '4115804', name: 'Medianeira' },
  { ibge: '4117602', name: 'Palmas' },
  { ibge: '4108957', name: 'Goioere' },
  { ibge: '4116208', name: 'Marechal Candido Rondon' },
  { ibge: '4112504', name: 'Jaguariaiva' },
  { ibge: '4114302', name: 'Mandaguari' },
  { ibge: '4126256', name: 'Sarandi' },
  { ibge: '4102802', name: 'Bandeirantes' },
  { ibge: '4107538', name: 'Dois Vizinhos' },
  { ibge: '4108403', name: 'Francisco Beltrao' },
  { ibge: '4117206', name: 'Ortigueira' },
  { ibge: '4117271', name: 'Paicandu' },
  { ibge: '4118402', name: 'Pato Branco' },
  { ibge: '4118707', name: 'Pinhao' },
  { ibge: '4119103', name: 'Pitanga' },
  { ibge: '4120606', name: 'Santa Fe' },
  { ibge: '4126306', name: 'Santo Antonio da Platina' },
  { ibge: '4127106', name: 'Telemaco Borba' },
  { ibge: '4128500', name: 'Wenceslau Braz' },
  { ibge: '4105805', name: 'Corbelia' },
  { ibge: '4121208', name: 'Santa Helena' },
  { ibge: '4101002', name: 'Ampere' },
  { ibge: '4114609', name: 'Marialva' },
]

// --- Rate limiter adaptativo (porte do AdaptiveRateLimiter; JS e
// single-threaded, entao os locks do Python somem) ------------------------

class AdaptiveRateLimiter {
  currentDelayMs: number
  totalRequests = 0
  totalErrors = 0
  consecutiveErrors = 0
  circuitBreakerOpen = false

  constructor(initialDelayMs = 100) {
    this.currentDelayMs = initialDelayMs
  }

  async wait() {
    await sleep(this.circuitBreakerOpen ? 500 : this.currentDelayMs)
  }

  onSuccess() {
    this.totalRequests++
    this.consecutiveErrors = 0
    this.currentDelayMs = Math.max(100, this.currentDelayMs * 0.95)
    if (this.circuitBreakerOpen && this.errorRate() < 0.3) {
      console.warn('[CircuitBreaker] taxa de erro < 30%, reabrindo circuito')
      this.circuitBreakerOpen = false
    }
  }

  on429() {
    this.totalRequests++
    this.totalErrors++
    this.consecutiveErrors++
    this.currentDelayMs = Math.min(this.currentDelayMs * 2, 10_000)
    console.warn(`[RateLimit] 429, novo delay: ${this.currentDelayMs}ms`)
  }

  onError() {
    this.totalRequests++
    this.totalErrors++
    this.consecutiveErrors++
    this.currentDelayMs = Math.min(this.currentDelayMs * 1.2, 10_000)
  }

  errorRate() {
    return this.totalRequests === 0 ? 0 : this.totalErrors / this.totalRequests
  }

  checkCircuitBreaker() {
    if (this.errorRate() > 0.5) this.circuitBreakerOpen = true
    return this.circuitBreakerOpen
  }
}

// --- Fetch por municipio --------------------------------------------------

interface DengueRecord {
  ibge_code: string
  municipality_name: string
  epidemiological_week: number
  year: number
  cases: number
  cases_est: number
  alert_level: number
  incidence_rate: number
  population: number | null
  [key: string]: unknown
}

interface FetchResult {
  success: boolean
  data: DengueRecord[]
  errorMsg: string | null
  mun: Municipio
}

async function fetchDengueMunicipality(
  mun: Municipio,
  limiter: AdaptiveRateLimiter,
): Promise<FetchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (limiter.checkCircuitBreaker()) {
      return {
        success: false,
        data: [],
        errorMsg: 'Circuit breaker aberto (taxa de erro > 50%)',
        mun,
      }
    }
    await limiter.wait()

    const url =
      `https://info.dengue.mat.br/api/alertcity?geocode=${mun.ibge}&disease=dengue` +
      `&format=json&ew_start=1&ew_end=52&ey_start=${CURRENT_YEAR - 1}&ey_end=${CURRENT_YEAR}`

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'c2-parana-etl/1.0 (+https://github.com/avnergomes/c2-parana)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(30_000),
      })

      if (resp.status === 429) {
        limiter.on429()
        if (attempt === 0) {
          await sleep(2000)
          continue
        }
        return { success: false, data: [], errorMsg: 'Rate limited (429) apos retry', mun }
      }

      if (resp.status !== 200) {
        limiter.onError()
        if (attempt === 0) {
          await sleep(2000)
          continue
        }
        return { success: false, data: [], errorMsg: `HTTP ${resp.status}`, mun }
      }

      const records = (await resp.json()) as Record<string, unknown>[]
      const dengueRecords: DengueRecord[] = []

      // InfoDengue devolve em ordem DESC (mais novo primeiro); ate 52 semanas
      // por run para preencher gaps de historico. Upsert e idempotente.
      for (const rec of records.slice(0, 52)) {
        try {
          const se = Math.trunc(Number(rec['SE'] ?? 0))
          const year = se > 10000 ? Math.trunc(Number(String(se).slice(0, 4))) : CURRENT_YEAR
          const week = se > 10000 ? Math.trunc(Number(String(se).slice(4))) : se
          const alertLevel = Math.min(Math.trunc(Number(rec['nivel'] ?? 0) || 0), 4)
          dengueRecords.push({
            ibge_code: mun.ibge,
            municipality_name: mun.name,
            epidemiological_week: week,
            year,
            cases: Math.trunc(Number(rec['casos'] ?? 0) || 0),
            cases_est: Number(rec['casos_est'] ?? 0) || 0,
            alert_level: alertLevel,
            incidence_rate: Number(rec['inc100k'] ?? 0) || 0,
            population: Math.trunc(Number(rec['pop'] ?? 0) || 0) || null,
          })
        } catch {
          continue
        }
      }

      limiter.onSuccess()
      return { success: true, data: dengueRecords, errorMsg: null, mun }
    } catch (err) {
      limiter.onError()
      if (attempt === 0) {
        await sleep(2000)
        continue
      }
      return { success: false, data: [], errorMsg: (err as Error).message, mun }
    }
  }
  return { success: false, data: [], errorMsg: 'Falha apos retry', mun }
}

/** Pool de workers com limiter compartilhado (substitui o ThreadPoolExecutor). */
async function fetchDengueConcurrent(
  municipios: Municipio[],
  maxWorkers: number,
): Promise<{ allDengue: DengueRecord[]; failed: { name: string; error: string }[]; limiter: AdaptiveRateLimiter }> {
  const limiter = new AdaptiveRateLimiter(100)
  const allDengue: DengueRecord[] = []
  const failed: { name: string; error: string }[] = []
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= municipios.length) return
      const result = await fetchDengueMunicipality(municipios[index], limiter)
      if (result.success) allDengue.push(...result.data)
      else failed.push({ name: result.mun.name, error: result.errorMsg ?? '?' })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxWorkers, municipios.length) }, () => worker()),
  )
  return { allDengue, failed, limiter }
}

async function upsertDengue(client: SupabaseClient, records: DengueRecord[]): Promise<number> {
  if (records.length === 0) return 0
  let saved = 0
  for (let i = 0; i < records.length; i += 200) {
    const batch = records.slice(i, i + 200)
    const { error } = await client
      .from('dengue_data')
      .upsert(batch, { onConflict: 'ibge_code,year,epidemiological_week' })
    if (!error) {
      saved += batch.length
    } else {
      console.warn(`upsert lote ${i}: ${error.message}`)
      for (const rec of batch) {
        const { error: e1 } = await client
          .from('dengue_data')
          .upsert(rec, { onConflict: 'ibge_code,year,epidemiological_week' })
        if (!e1) saved++
      }
    }
  }
  return saved
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'saude', async (client: SupabaseClient): Promise<RunResult> => {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'tier1'
    const batchParam = url.searchParams.get('batch')

    let municipios: Municipio[]
    if (mode === 'full') {
      const all: Municipio[] = PR_MUNICIPIOS.map(([ibge, name]) => ({ ibge, name }))
      if (batchParam) {
        // 3 lotes de ~133 para caber no wall-clock da Edge Function
        const batch = Math.max(1, Math.min(3, Math.trunc(Number(batchParam)) || 1))
        const per = Math.ceil(all.length / 3)
        municipios = all.slice((batch - 1) * per, batch * per)
      } else {
        municipios = all
      }
    } else {
      municipios = TIER1_MUNICIPIOS
    }

    const { allDengue, failed, limiter } = await fetchDengueConcurrent(municipios, MAX_WORKERS)

    const recordsSaved = await upsertDengue(client, allDengue)

    const status =
      failed.length === 0
        ? 'success'
        : failed.length < municipios.length * 0.3
          ? 'partial'
          : 'error'
    if (status === 'error') {
      throw new Error(
        `${failed.length}/${municipios.length} municipios falharam (taxa ${(
          limiter.errorRate() * 100
        ).toFixed(0)}%)`,
      )
    }

    return {
      status,
      mode: mode === 'full' ? `full${batchParam ? `-batch${batchParam}` : ''}` : 'tier1',
      municipalities_processed: municipios.length,
      municipalities_failed: failed.length,
      records_saved: recordsSaved,
      final_error_rate: Math.round(limiter.errorRate() * 1000) / 1000,
      errors: failed.slice(0, 20).map((m) => `${m.name}: ${m.error}`),
    }
  })
)
