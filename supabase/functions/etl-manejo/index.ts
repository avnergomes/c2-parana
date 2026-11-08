// supabase/functions/etl-manejo/index.ts
// Relatórios do Manejo.App (grupo IDR-Paraná) -> bucket privado datageo-privado.
//
// Secrets MANEJO_USER/MANEJO_PASSWORD. Os arquivos têm nome de produtor e
// coordenada exata: só bucket privado (leitura com app_metadata.datageo),
// nunca data_cache. Health e resposta levam só contagens e nomes de campos.
// Autorização de uso dos dados do IDR nesta integração: confirmar com o
// controlador (IDR-Paraná) antes de ampliar o acesso.

import { fetchJson, fetchWithRetry, runEtl, type RunResult, type SupabaseClient } from '../_shared/etl.ts'
import { construir, resumoErroLogin, safraAtual } from './transform.js'

const BASE = 'https://idr.manejo.app/api'
const BUCKET_PRIVADO = 'datageo-privado'
const EMPRESA_IDR = '64259bbb-e79f-47f8-a84d-cff557b81ba2'
const ESTADO_PR = '2ad04544-df52-44c8-ab41-6ca78cf61247'

const RELATORIOS = {
  general: 'general-report/',
  mid: 'mid-report/',
  mip: 'mip-report/',
  coletores: 'mid-collector-report/points/',
  armadilhas: 'mip-trap-report/',
  pulverizacoes: 'pulverization-report/',
  pluviometros: 'pluviometer-report/',
} as const

type Linha = Record<string, unknown>

const lista = (j: unknown): Linha[] =>
  (Array.isArray(j) ? j : (Object.values((j ?? {}) as object).find(Array.isArray) ?? [])) as Linha[]

// retries: 1 porque repetir senha pode bloquear a conta.
async function login(usernameOrEmail: string, password: string): Promise<string> {
  const resp = await fetchWithRetry(`${BASE}/users/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
    retries: 1,
  })
  if (resp.status === 400) throw new Error(`login Manejo: 400 ${resumoErroLogin(await resp.json().catch(() => null))}`)
  if (!resp.ok) throw new Error(`login Manejo: HTTP ${resp.status}`)
  const j = await resp.json()
  const token = j.token ?? j.access_token ?? j.accessToken ?? j.data?.token ?? j.data?.access_token ?? j.data?.accessToken
  if (!token) throw new Error(`login Manejo: resposta sem token, chaves: ${Object.keys(j).join(',')}`)
  return String(token)
}

Deno.serve((req: Request) =>
  runEtl(req, 'manejo', async (client: SupabaseClient): Promise<RunResult> => {
    const user = Deno.env.get('MANEJO_USER')
    const password = Deno.env.get('MANEJO_PASSWORD')
    if (!user || !password) return { status: 'empty', motivo: 'sem MANEJO_USER/MANEJO_PASSWORD' }

    const headers = { Authorization: `Bearer ${await login(user, password)}`, Accept: 'application/json' }
    const get = async (caminho: string, timeoutMs = 60_000) =>
      lista(await fetchJson(`${BASE}/${caminho}`, { headers, timeoutMs }))

    const safra = safraAtual(await get('harvests/?page=1&limit=15'))
    if (!safra?.id) throw new Error('nenhuma safra corrente em /harvests/')
    const categorias = await get(`categories/?page=1&limit=2000&company=${EMPRESA_IDR}`)
    if (categorias.length === 0) throw new Error('nenhuma categoria em /categories/')

    const query = new URLSearchParams({ harvestId: String(safra.id), stateId: ESTADO_PR, companyId: EMPRESA_IDR })
    for (const c of categorias) query.append('categoryIds', String(c.id))

    // Tudo buscado antes de gravar: falha em um relatório não deixa camadas de cargas diferentes.
    const linhas: Record<string, Linha[]> = {}
    for (const [nome, caminho] of Object.entries(RELATORIOS)) linhas[nome] = await get(`${caminho}?${query}`)

    const arquivos = construir(linhas as Parameters<typeof construir>[0])
    const results: Record<string, number> = {}
    let vazios = 0
    for (const [nome, gj] of Object.entries(arquivos)) {
      results[nome] = gj.features.length
      // Fonte vazia não apaga o último arquivo bom.
      if (gj.features.length === 0) {
        vazios++
        continue
      }
      const { error } = await client.storage.from(BUCKET_PRIVADO).upload(
        nome,
        new Blob([JSON.stringify(gj)], { type: 'application/geo+json' }),
        { upsert: true, contentType: 'application/geo+json', cacheControl: '300' },
      )
      if (error) throw new Error(`upload ${nome}: ${error.message}`)
    }

    return {
      status: vazios === 0 ? 'success' : vazios < Object.keys(arquivos).length ? 'partial' : 'empty',
      categorias: categorias.length,
      linhas: Object.fromEntries(Object.entries(linhas).map(([k, v]) => [k, v.length])),
      features: results,
    }
  })
)
