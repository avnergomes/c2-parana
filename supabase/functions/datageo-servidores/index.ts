// supabase/functions/datageo-servidores/index.ts
// Servidores do IDR-Paraná (SisPont + Portal da Transparência) -> bucket
// privado datageo-privado/servidores-idr.json, lido pelo DataGeo só com
// usuário liberado (app_metadata.datageo).
//
// Fontes:
//   - SisPont (UEPG, HTTP): relat.php regrava dados.csv a cada acesso, então
//     a função chama relat.php antes de baixar o CSV (cp1252).
//   - Portal da Transparência PR: RELACAO_SERVIDORES.zip (TB_RH.csv, todos os
//     órgãos, regerado 1x/dia ~05:44). Sem ele a função publica só o SisPont
//     (status partial).
//   - Relação do RH (servidores-rh.json no mesmo bucket, mensal, publicada
//     pelo datageo-command): fonte de verdade sobre quadro, município, vínculo
//     e cessão. Ausente ou inválida -> segue só com SisPont + Portal.
//
// Schedule: pg_cron de hora em hora (migration 046). Parser em parse.ts.

import { unzipSync } from 'https://esm.sh/fflate@0.8.2'
import { fetchText, fetchWithRetry, runEtl, type RunResult } from '../_shared/etl.ts'
import {
  aplicaRh, buildServidores, indexaPortal, parseSemicolonCsv, PORTAL_COLS, SISPONT_COLS, type PortalRow, type Rh,
  validaRh,
} from './parse.ts'

const SISPONT_BASE = 'http://200.201.27.34/IDR-SisPont/gap/configuracao/share'
const PORTAL_ZIP =
  'https://www.transparencia.download.pr.gov.br/exportacao/RELACAO_SERVIDORES/RELACAO_SERVIDORES.zip'
const BUCKET = 'datageo-privado'
const ARQUIVO = 'servidores-idr.json'
const ARQUIVO_RH = 'servidores-rh.json'
// Abaixo disso o SisPont devolveu algo quebrado: mantém o arquivo anterior.
const MIN_SERVIDORES = 1000

async function lerSispont(): Promise<Record<string, string>[]> {
  const relat = await fetchWithRetry(`${SISPONT_BASE}/relat.php`, { timeoutMs: 60_000, retries: 2 })
  // Ler a página até o fim: cortar a conexão interrompe o PHP no meio da
  // gravação do dados.csv (testado: 297 linhas em vez de 1.593).
  await relat.arrayBuffer()
  if (!relat.ok) throw new Error(`SisPont relat.php: HTTP ${relat.status}`)
  const csv = await fetchText(`${SISPONT_BASE}/dados.csv`, { timeoutMs: 30_000, retries: 3, charset: 'windows-1252' })
  return parseSemicolonCsv(csv, SISPONT_COLS)
}

async function lerPortal(): Promise<Map<string, PortalRow[]>> {
  const resp = await fetchWithRetry(PORTAL_ZIP, { timeoutMs: 60_000, retries: 3 })
  if (!resp.ok) throw new Error(`Portal: HTTP ${resp.status}`)
  const zip = unzipSync(new Uint8Array(await resp.arrayBuffer()), { filter: (f) => f.name.endsWith('TB_RH.csv') })
  const bytes = Object.values(zip)[0]
  if (!bytes) throw new Error('Portal: TB_RH.csv ausente no zip')
  const texto = new TextDecoder('utf-8').decode(bytes)
  // Só o cabeçalho e as linhas do IDR: o arquivo tem ~170 mil linhas de todos os órgãos.
  const [header, ...linhas] = texto.split(/\r?\n/)
  const idr = linhas.filter((l) => l.startsWith('IDR;'))
  return indexaPortal(parseSemicolonCsv([header, ...idr].join('\n'), PORTAL_COLS))
}

// deno-lint-ignore no-explicit-any
async function lerRh(client: any): Promise<Rh | null> {
  const { data, error } = await client.storage.from(BUCKET).download(ARQUIVO_RH)
  if (error || !data) {
    console.warn(`datageo_servidores: ${ARQUIVO_RH} indisponível: ${error?.message ?? 'vazio'}`)
    return null
  }
  const rh = validaRh(JSON.parse(await data.text()))
  if (!rh) console.warn(`datageo_servidores: ${ARQUIVO_RH} em formato inesperado, ignorado`)
  return rh
}

Deno.serve((req: Request) =>
  runEtl(req, 'datageo_servidores', async (client): Promise<RunResult> => {
    const sispont = await lerSispont()
    let portal = new Map<string, PortalRow[]>()
    let portalErro: string | null = null
    try {
      portal = await lerPortal()
    } catch (err) {
      portalErro = (err as Error).message
      console.warn(`datageo_servidores: portal indisponível: ${portalErro}`)
    }

    let rh: Rh | null = null
    try {
      rh = await lerRh(client)
    } catch (err) {
      console.warn(`datageo_servidores: RH ilegível: ${(err as Error).message}`)
    }

    const servidores = aplicaRh(buildServidores(sispont, portal), rh)
    if (servidores.length < MIN_SERVIDORES) {
      throw new Error(`SisPont com ${servidores.length} servidores (< ${MIN_SERVIDORES}); arquivo anterior mantido`)
    }

    const payload = {
      gerado_em: new Date().toISOString(),
      fontes: {
        sispont: 'IDR-SisPont (relatório de servidores)',
        portal: portalErro ? null : 'Portal da Transparência PR, Relação de Servidores',
        rh: rh ? `${rh.fonte}, ${rh.referencia}` : null,
      },
      servidores,
    }
    const { error } = await client.storage.from(BUCKET).upload(
      ARQUIVO,
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      { upsert: true, contentType: 'application/json', cacheControl: '300' },
    )
    if (error) throw new Error(`upload ${ARQUIVO}: ${error.message}`)

    // Health só com contagens: nada pessoal em data_cache.
    const comPortal = servidores.filter((s) => s.cargo_portal).length
    return {
      status: portalErro ? 'partial' : 'success',
      servidores: servidores.length,
      extensionistas: servidores.filter((s) => s.extensionista).length,
      com_portal: comPortal,
      sem_formacao: servidores.filter((s) => !s.formacao).length,
      em_unidades: servidores.filter((s) => s.unidade).length,
      portal_erro: portalErro,
      rh: rh?.referencia ?? null,
      fora_rh: rh ? servidores.filter((s) => !s.rh).length : null,
    }
  })
)
