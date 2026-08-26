// supabase/functions/etl-agro/index.ts
// VBP (SIDRA) + ComexStat (MDIC) + Emprego (CEMPRE) + Credito Rural (SICOR).
//
// Porte Deno de scripts/etl_agro.py (a especificacao). 4 fontes REST/JSON
// independentes com fallback estatico cada; a flag is_fallback do VBP
// (mitigacao do item C7 da auditoria) e preservada -- o frontend deve exibir
// badge "estimativa" quando true. Caches: vbp_kpis_pr, vbp_municipios_pr,
// comex_kpis_pr, emprego_agro_pr, credito_rural_pr,
// credito_rural_municipios_pr.

import { runEtl, sleep, type RunResult, type SupabaseClient } from '../_shared/etl.ts'

async function requestJson(
  method: string,
  url: string,
  opts: { maxRetries?: number; timeoutMs?: number; body?: unknown } = {},
): Promise<unknown | null> {
  const { maxRetries = 3, timeoutMs = 60_000, body } = opts
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (resp.status === 200) return await resp.json()
      if ([429, 500, 502, 503, 504].includes(resp.status)) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      console.warn(`${url.split('?')[0]}: HTTP ${resp.status}`)
      return null
    } catch (err) {
      console.warn(`${url.split('?')[0]}: ${(err as Error).message}`)
      await sleep(1500)
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

// --- 1. VBP SIDRA ---------------------------------------------------------

type VbpResult = [Record<string, unknown>, Record<string, unknown>[]]

function getVbpFallback(): VbpResult {
  // Aproximacoes publicas (SEAB/IBGE 2023); frontend checa is_fallback.
  return [
    {
      vbp_total_brl: 152_000_000_000,
      vbp_lavoura_brl: 98_000_000_000,
      vbp_pecuaria_brl: 54_000_000_000,
      variacao_yoy: 3.8,
      ano_referencia: '2023',
      is_fallback: true,
      fallback_source: 'SEAB/IBGE 2023 — valor estimado, SIDRA indisponível',
    },
    [
      { ibge_code: '4104808', nome: 'Cascavel', vbp_total: 4_500_000_000 },
      { ibge_code: '4127700', nome: 'Toledo', vbp_total: 4_200_000_000 },
      { ibge_code: '4104402', nome: 'Campo Mourão', vbp_total: 3_800_000_000 },
      { ibge_code: '4113700', nome: 'Londrina', vbp_total: 3_500_000_000 },
      { ibge_code: '4115200', nome: 'Maringá', vbp_total: 3_200_000_000 },
      { ibge_code: '4119905', nome: 'Ponta Grossa', vbp_total: 2_900_000_000 },
      { ibge_code: '4109401', nome: 'Guarapuava', vbp_total: 2_700_000_000 },
      { ibge_code: '4128104', nome: 'Umuarama', vbp_total: 2_500_000_000 },
      { ibge_code: '4118501', nome: 'Paranavaí', vbp_total: 2_300_000_000 },
      { ibge_code: '4101804', nome: 'Assis Chateaubriand', vbp_total: 2_100_000_000 },
    ],
  ]
}

async function fetchVbpSidra(): Promise<VbpResult> {
  const url = 'https://apisidra.ibge.gov.br/values/t/5457/n3/41/v/214/p/last%201/c782/0'
  const resp = await requestJson('GET', url)
  if (resp === null || !Array.isArray(resp) || resp.length < 2) return getVbpFallback()

  const rows = resp.slice(1) as Record<string, string>[]
  const prData = rows.filter((r) => (r['D1C'] ?? '').startsWith('41'))
  if (prData.length === 0) return getVbpFallback()

  const totalValor = prData.reduce((acc, r) => acc + (Number(r['V'] ?? 0) || 0), 0)
  const ano = prData[0]['D3N'] ?? String(new Date().getFullYear() - 1)

  const municipios = new Map<string, { ibge_code: string; nome: string; vbp_total: number }>()
  for (const r of prData) {
    const ibge = r['D1C'] ?? ''
    const entry = municipios.get(ibge) ?? { ibge_code: ibge, nome: r['D1N'] ?? '', vbp_total: 0 }
    entry.vbp_total += Number(r['V'] ?? 0) || 0
    municipios.set(ibge, entry)
  }
  const top = [...municipios.values()].sort((a, b) => b.vbp_total - a.vbp_total).slice(0, 20)

  return [
    {
      vbp_total_brl: totalValor * 1000, // SIDRA retorna em mil reais
      vbp_lavoura_brl: totalValor * 1000 * 0.65, // estimativa (mesma do Python)
      vbp_pecuaria_brl: totalValor * 1000 * 0.35,
      variacao_yoy: 5.2,
      ano_referencia: ano,
      is_fallback: false,
    },
    top.map((m) => ({ ibge_code: m.ibge_code, nome: m.nome, vbp_total: m.vbp_total * 1000 })),
  ]
}

// --- 2. ComexStat ---------------------------------------------------------

function yyyymm(d: Date): string {
  return d.toISOString().slice(0, 7).replace('-', '')
}

function getComexFallback(): Record<string, unknown> {
  return {
    exportacoes_usd: 22_500_000_000,
    importacoes_usd: 14_800_000_000,
    saldo_usd: 7_700_000_000,
    variacao_export_yoy: 6.2,
    mes_referencia: yyyymm(new Date(Date.now() - 30 * 86_400_000)),
  }
}

async function fetchComexstat(): Promise<Record<string, unknown>> {
  const now = Date.now()
  const fromPeriod = yyyymm(new Date(now - 365 * 86_400_000))
  const toPeriod = yyyymm(new Date(now - 30 * 86_400_000))
  const url = 'https://api-comexstat.mdic.gov.br/general'
  const basePayload = {
    flow: 'export',
    monthDetail: false,
    period: { from: fromPeriod, to: toPeriod },
    filters: [{ id: 'state', values: ['41'] }],
    details: [],
    metrics: ['metricFOB'],
  }

  const respExp = await requestJson('POST', url, { body: basePayload })
  const respImp = await requestJson('POST', url, { body: { ...basePayload, flow: 'import' } })

  if (respExp && respImp) {
    const metric = (r: unknown): number => {
      const list = ((r as Record<string, unknown>)['data'] as Record<string, unknown> | undefined)?.[
        'list'
      ] as Record<string, unknown>[] | undefined
      return Number(list?.[0]?.['metricFOB'] ?? 0) || 0
    }
    const expTotal = metric(respExp)
    const impTotal = metric(respImp)
    if (expTotal || impTotal) {
      return {
        exportacoes_usd: expTotal,
        importacoes_usd: impTotal,
        saldo_usd: expTotal - impTotal,
        variacao_export_yoy: 4.5,
        mes_referencia: toPeriod,
      }
    }
  }
  return getComexFallback()
}

// --- 3. Emprego agro (CEMPRE) ---------------------------------------------

function getEmpregoFallback(): Record<string, unknown> {
  return {
    estoque_atual: 485_000,
    saldo_mes: 2_300,
    variacao_yoy: 2.1,
    ano_referencia: '2023',
    serie: [
      { ano: '2021', ano_mes: '2021-12', pessoal_ocupado: 462000, saldo: 0 },
      { ano: '2022', ano_mes: '2022-12', pessoal_ocupado: 475000, saldo: 13000 },
      { ano: '2023', ano_mes: '2023-12', pessoal_ocupado: 485000, saldo: 10000 },
    ],
  }
}

async function fetchEmpregoAgro(): Promise<Record<string, unknown>> {
  const url = 'https://apisidra.ibge.gov.br/values/t/6450/n3/41/v/707/p/last%203/c12762/117897'
  const resp = await requestJson('GET', url)
  if (resp && Array.isArray(resp) && resp.length > 1) {
    const valores: { ano: string; pessoal_ocupado: number }[] = []
    for (const r of resp.slice(1) as Record<string, string>[]) {
      const val = Number(r['V'] ?? 0) || 0
      if (val > 0) valores.push({ ano: r['D3N'] ?? '', pessoal_ocupado: val })
    }
    if (valores.length > 0) {
      valores.sort((a, b) => (a.ano < b.ano ? 1 : -1))
      const atual = valores[0].pessoal_ocupado
      const anterior = valores.length > 1 ? valores[1].pessoal_ocupado : atual
      const variacao = anterior ? ((atual - anterior) / anterior) * 100 : 0

      const asc = [...valores].reverse()
      const serie = asc.map((v, idx) => {
        const prev = idx > 0 ? asc[idx - 1].pessoal_ocupado : v.pessoal_ocupado
        return {
          ano: v.ano,
          ano_mes: `${v.ano}-12`,
          pessoal_ocupado: Math.trunc(v.pessoal_ocupado),
          saldo: Math.trunc(v.pessoal_ocupado - prev),
        }
      })

      return {
        estoque_atual: Math.trunc(atual),
        saldo_mes: valores.length > 1 ? Math.trunc((atual - anterior) / 12) : 0,
        variacao_yoy: Math.round(variacao * 10) / 10,
        ano_referencia: valores[0].ano,
        serie: serie.slice(-5),
      }
    }
  }
  return getEmpregoFallback()
}

// --- 4. Credito rural (SICOR) ---------------------------------------------

type CreditoResult = [Record<string, unknown>, Record<string, unknown>[]]

async function fetchSicorYear(ano: number): Promise<[number, Record<string, unknown>[]]> {
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/CusteioMunicipio' +
    `?$filter=UF%20eq%20'PR'%20and%20AnoEmissao%20eq%20${ano}&$format=json&$top=5000`
  const resp = await requestJson('GET', url, { maxRetries: 2, timeoutMs: 45_000 })
  if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
    const items = ((resp as Record<string, unknown>)['value'] ?? []) as Record<string, unknown>[]
    const total = items.reduce((acc, i) => acc + (Number(i['VlCusteio'] ?? 0) || 0), 0)
    return [total, items]
  }
  return [0, []]
}

function getCreditoFallback(): CreditoResult {
  const ano = new Date().getFullYear()
  return [
    {
      total_ano_brl: 45_000_000_000,
      num_contratos: 185_000,
      variacao_yoy: 12.3,
      ano_referencia: String(ano),
      serie: [
        { ano_mes: `${ano - 4}-12`, valor: 28_500_000_000 },
        { ano_mes: `${ano - 3}-12`, valor: 32_000_000_000 },
        { ano_mes: `${ano - 2}-12`, valor: 37_000_000_000 },
        { ano_mes: `${ano - 1}-12`, valor: 40_100_000_000 },
        { ano_mes: `${ano}-12`, valor: 45_000_000_000 },
      ],
    },
    [
      { ibge_code: '4104808', municipio: 'Cascavel', valor_total: 1_800_000_000, num_contratos: 4500 },
      { ibge_code: '4127700', municipio: 'Toledo', valor_total: 1_600_000_000, num_contratos: 4200 },
      { ibge_code: '4104402', municipio: 'Campo Mourão', valor_total: 1_400_000_000, num_contratos: 3800 },
      { ibge_code: '4113700', municipio: 'Londrina', valor_total: 1_200_000_000, num_contratos: 3500 },
      { ibge_code: '4115200', municipio: 'Maringá', valor_total: 1_100_000_000, num_contratos: 3200 },
      { ibge_code: '4119905', municipio: 'Ponta Grossa', valor_total: 950_000_000, num_contratos: 2900 },
      { ibge_code: '4109401', municipio: 'Guarapuava', valor_total: 850_000_000, num_contratos: 2700 },
      { ibge_code: '4128104', municipio: 'Umuarama', valor_total: 780_000_000, num_contratos: 2500 },
      { ibge_code: '4118501', municipio: 'Paranavaí', valor_total: 720_000_000, num_contratos: 2300 },
      { ibge_code: '4101804', municipio: 'Assis Chateaubriand', valor_total: 680_000_000, num_contratos: 2100 },
    ],
  ]
}

async function fetchCreditoRural(): Promise<CreditoResult> {
  const ano = new Date().getFullYear()
  const [total, items] = await fetchSicorYear(ano)
  if (items.length === 0) return getCreditoFallback()

  const munAgg = new Map<
    string,
    { ibge_code: string; municipio: string; valor_total: number; num_contratos: number }
  >()
  for (const i of items) {
    const ibge = String(i['cdMunicipio'] ?? '')
    const entry = munAgg.get(ibge) ?? {
      ibge_code: ibge,
      municipio: (i['Municipio'] as string) ?? '',
      valor_total: 0,
      num_contratos: 0,
    }
    entry.valor_total += Number(i['VlCusteio'] ?? 0) || 0
    entry.num_contratos += 1
    munAgg.set(ibge, entry)
  }
  const municipios = [...munAgg.values()].sort((a, b) => b.valor_total - a.valor_total)

  const serie: { ano_mes: string; valor: number }[] = []
  for (let y = ano - 4; y <= ano; y++) {
    const yTotal = y === ano ? total : (await fetchSicorYear(y))[0]
    if (yTotal > 0) serie.push({ ano_mes: `${y}-12`, valor: yTotal })
  }

  let variacaoYoy = 0
  if (serie.length >= 2 && serie[serie.length - 2].valor > 0) {
    variacaoYoy =
      Math.round(
        ((serie[serie.length - 1].valor - serie[serie.length - 2].valor) /
          serie[serie.length - 2].valor) *
          1000,
      ) / 10
  }

  return [
    {
      total_ano_brl: total,
      num_contratos: items.length,
      variacao_yoy: variacaoYoy || 8.5,
      ano_referencia: String(ano),
      serie,
    },
    municipios,
  ]
}

// --- Main -----------------------------------------------------------------

Deno.serve((req: Request) =>
  runEtl(req, 'agro', async (client: SupabaseClient): Promise<RunResult> => {
    const results: Record<string, string> = {}
    const errors: string[] = []

    try {
      const [vbpKpis, vbpMunicipios] = await fetchVbpSidra()
      await upsertCacheWithWrap(client, 'vbp_kpis_pr', vbpKpis, 'ibge_sidra')
      await upsertCacheWithWrap(client, 'vbp_municipios_pr', vbpMunicipios, 'ibge_sidra')
      results['vbp'] = vbpKpis['is_fallback'] ? 'OK (fallback)' : 'OK'
    } catch (e) {
      results['vbp'] = 'ERROR'
      errors.push(`VBP: ${(e as Error).message}`)
    }

    try {
      const comex = await fetchComexstat()
      await upsertCacheWithWrap(client, 'comex_kpis_pr', comex, 'mdic_comexstat')
      results['comex'] = 'OK'
    } catch (e) {
      results['comex'] = 'ERROR'
      errors.push(`ComexStat: ${(e as Error).message}`)
    }

    try {
      const emprego = await fetchEmpregoAgro()
      await upsertCacheWithWrap(client, 'emprego_agro_pr', emprego, 'ibge_cempre')
      results['emprego'] = 'OK'
    } catch (e) {
      results['emprego'] = 'ERROR'
      errors.push(`Employment: ${(e as Error).message}`)
    }

    try {
      const [creditoKpis, creditoMunicipios] = await fetchCreditoRural()
      await upsertCacheWithWrap(client, 'credito_rural_pr', creditoKpis, 'bcb_sicor')
      await upsertCacheWithWrap(client, 'credito_rural_municipios_pr', creditoMunicipios, 'bcb_sicor')
      results['credito'] = 'OK'
    } catch (e) {
      results['credito'] = 'ERROR'
      errors.push(`SICOR: ${(e as Error).message}`)
    }

    const values = Object.values(results)
    const status = values.every((v) => v.startsWith('OK'))
      ? 'success'
      : values.every((v) => v === 'ERROR')
        ? 'error'
        : 'partial'
    if (status === 'error') throw new Error(errors.join(' | '))

    return { status, results, errors }
  })
)
