// Toda lista de codigo IBGE escrita a mao nos ETLs confere com a lista oficial
// (_shared/pr_municipios.ts). Em 2026-10, 27 dos 50 codigos do TIER1 da dengue
// e os de Apucarana/Campo Mourao no clima apontavam para outro municipio (ou
// para nenhum).
// npx deno test --allow-read supabase/functions/_shared/ibge_listas.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { PR_MUNICIPIOS, stripAccentsLower } from './pr_municipios.ts'

const RAIZ = new URL('../../../', import.meta.url)
const nomePorCodigo = new Map(PR_MUNICIPIOS.map(([ibge, nome]) => [ibge, nome]))
const codigoPorNome = new Map(PR_MUNICIPIOS.map(([ibge, nome]) => [stripAccentsLower(nome), ibge]))

async function ler(caminho: string): Promise<string> {
  return await Deno.readTextFile(new URL(caminho, RAIZ))
}

/** Pares (codigo, nome) que aparecem juntos numa mesma linha. */
function pares(texto: string, padrao: RegExp): [string, string][] {
  return [...texto.matchAll(padrao)].map((m) => [m[1], m[2]])
}

function conferir(arquivo: string, lista: [string, string][]) {
  assert(lista.length > 0, `${arquivo}: nenhum par encontrado (o padrao do teste ficou velho?)`)
  for (const [codigo, nome] of lista) {
    assert(nomePorCodigo.has(codigo), `${arquivo}: ${codigo} (${nome}) nao e municipio do PR`)
    assertEquals(
      codigoPorNome.get(stripAccentsLower(nome)),
      codigo,
      `${arquivo}: ${nome} esta com ${codigo} (${nomePorCodigo.get(codigo)})`,
    )
  }
}

const TS_IBGE_NOME = /ibge: '(\d{7})', name: '([^']+)'/g
const PY_IBGE_NOME = /"ibge": "(\d{7})", "name": "([^"]+)"/g

Deno.test('etl-saude: TIER1 (Deno e Python)', async () => {
  const ts = pares(await ler('supabase/functions/etl-saude/index.ts'), TS_IBGE_NOME)
  const py = pares(await ler('scripts/etl_saude.py'), PY_IBGE_NOME)
  assertEquals(ts.length, 50)
  assertEquals(py.length, 50)
  conferir('etl-saude/index.ts', ts)
  conferir('scripts/etl_saude.py', py)
  assertEquals(new Set(ts.map(([c]) => c)).size, 50, 'codigo repetido no TIER1')
})

Deno.test('etl-clima: estacoes (Deno e Python)', async () => {
  conferir(
    'etl-clima/index.ts',
    pares(await ler('supabase/functions/etl-clima/index.ts'), /municipality: '([^']+)', ibge: '(\d{7})'/g).map(
      ([nome, codigo]) => [codigo, nome],
    ),
  )
  conferir(
    'scripts/etl_clima.py',
    pares(await ler('scripts/etl_clima.py'), /"municipality": "([^"]+)", "ibge": "(\d{7})"/g).map(
      ([nome, codigo]) => [codigo, nome],
    ),
  )
})

Deno.test('etl-agro: fallbacks de VBP e credito (Deno e Python)', async () => {
  conferir(
    'etl-agro/index.ts',
    pares(await ler('supabase/functions/etl-agro/index.ts'), /ibge_code: '(\d{7})', (?:nome|municipio): '([^']+)'/g),
  )
  conferir(
    'scripts/etl_agro.py',
    pares(await ler('scripts/etl_agro.py'), /"ibge_code": "(\d{7})", "(?:nome|municipio)": "([^"]+)"/g),
  )
})

Deno.test('etl-irtc: cidades do AQICN existem', async () => {
  for (const arquivo of ['supabase/functions/etl-irtc/index.ts', 'scripts/etl_irtc.py']) {
    const texto = await ler(arquivo)
    const inicio = texto.indexOf('CITY_TO_IBGE')
    const bloco = texto.slice(inicio, texto.indexOf('}', inicio))
    const codigos = [...bloco.matchAll(/['"](41\d{5})['"]/g)].map((m) => m[1])
    assertEquals(codigos.length, 12, arquivo)
    for (const c of codigos) assert(nomePorCodigo.has(c), `${arquivo}: ${c} nao existe`)
  }
})
