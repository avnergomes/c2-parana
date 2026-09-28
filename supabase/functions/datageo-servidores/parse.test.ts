// npx deno test supabase/functions/datageo-servidores/parse.test.ts
// Fixture sintética: nomes e números inventados (nada de dado real no repo).
import { assertEquals } from 'jsr:@std/assert@1'
import {
  buildServidores, casaPortal, indexaPortal, isExtensionista, limpaEspecialidade, norm,
  parseSemicolonCsv, PORTAL_COLS, SISPONT_COLS, tituloCargo, unidadeDe,
} from './parse.ts'

const SISPONT = [
  'ID;SERVIDOR;CHEFIA;ORD;RG;QUADRO;LF;CARGO;DESCRICAO CARGO;SERIE;CLASSE;REFERENCIA;FUNCAO;ESPECIALIDADE;TIPO ALTERACAO;DATA MOVIMENTACAO;ATO FORMAL;MUNICIPIO;REGIAO;MESOREGIAO;SETOR;COORDENACAO;GERENCIA;DIRETORIA;PRESIDENCIA;',
  '900001;FULANA DE TAL;Chefia:  BELTRANO;3;11111111;QPIDR;3;PS;Profissional Graduação Superior;NA;4;NA;GEES;EAGO - Engenharia Agronômica;ENQ;01/01/2025;X;Pitanga;;;Unidade Municipal de Pitanga; ;Chefe;Diretoria de Extensao Rural;Presidencia Executiva;',
  '1234;CICLANO SILVA;Chefia:  BELTRANO;.;.;.;.;.;.;.;.;.;.;.;.;.;.; Guarapuava;;;Unidade Municipal; ;Chefe;Diretoria de Extensao Rural;Presidencia Executiva;',
  '1235;JOÃO AUXILIAR;Chefia:  BELTRANO;.;.;.;.;.;.;.;.;.;.;.;.;.;.;Lapa;;;Unidade Municipal; ;Chefe;Diretoria de Extensao Rural;Presidencia Executiva;',
  '900002;MARIA PESQUISA;Chefia:  X;3;22222222;QPIDR;3;PP;Profissional Pesquisador;NA;4;NA;PQ;Pesquisador;ENQ;01/01/2025;X;Londrina;Polo de Pesquisa Londrina;;ESTAÇÃO DE PESQUISA - LONDRINA/IBIPORÃ;Coordenacao de Estacao de Pesquisa - Londrina/Ibipora ;Chefe;Diretoria de Pesquisa e Inovacao ;Presidencia Executiva;',
  '3106;DISPOSICAO - MDA;;.;.;.;.;.;.;.;.;.;.;.;.;.;.;Curitiba;;;;;;;;',
  '1236;HOMONIMO REPETIDO;Chefia: X;.;.;.;.;.;.;.;.;.;.;.;.;.;.;Irati;;;Unidade Municipal; ;Chefe;Diretoria de Extensao Rural;Presidencia Executiva;',
].join('\r\n')

const PORTAL = [
  'sigla;instituicao;nome;cargo;lotacao;dt_inicio;dt_fim',
  'IDR;INSTITUTO;CICLANO SILVA;ENGENHEIRO AGRONOMO;UNIDADE MUNICIPAL DE GUARAPUAVA;1990-01-02;4000-01-01',
  'IDR;INSTITUTO;JOAO AUXILIAR;ASSIST. ADMINISTRATIVO;UNIDADE MUNICIPAL DE LAPA;2001-03-04;4000-01-01',
  'IDR;INSTITUTO;HOMONIMO REPETIDO;TECNICO AGRICOLA;UNIDADE MUNICIPAL DE PALMAS;2000-01-01;4000-01-01',
  'IDR;INSTITUTO;HOMONIMO REPETIDO;ENGENHEIRO AGRONOMO;UNIDADE MUNICIPAL DE CASTRO;2000-01-01;4000-01-01',
  'SEAB;SECRETARIA;CICLANO SILVA;MOTORISTA;CURITIBA;1990-01-01;4000-01-01',
].join('\n')

const servidores = () =>
  buildServidores(parseSemicolonCsv(SISPONT, SISPONT_COLS), indexaPortal(parseSemicolonCsv(PORTAL, PORTAL_COLS)))

Deno.test('norm tira acento e colapsa espaço', () => {
  assertEquals(norm('  João   Tavôra '), 'JOAO TAVORA')
})

Deno.test('unidadeDe: estação vence polo; polo, UF e unidade de pesquisa', () => {
  assertEquals(unidadeDe('ESTAÇÃO DE PESQUISA - LONDRINA/IBIPORÃ', ''), 'londrina-ibipora')
  assertEquals(unidadeDe('Polo de Pesquisa Santa Tereza do Oeste', 'Coordenacao de Estacao de Pesquisa - Santa Tereza do Oeste'), 'santa-tereza-do-oeste')
  assertEquals(unidadeDe('COORDENAÇÃO DE ESTAÇÃO DE PESQUISA PALOTINA', ''), 'palotina')
  assertEquals(unidadeDe('Chefe da Estação de Pesquisa de Ponta Grossa', ''), 'ponta-grossa')
  assertEquals(unidadeDe('Unidade de Pesquisa de Morretes', ''), 'morretes')
  // SETOR vence a coordenação acumulada de outra estação.
  assertEquals(unidadeDe('Unidade de Pesquisa de Morretes', 'Chefe da Estação de Pesquisa Pinhais'), 'morretes')
  assertEquals(unidadeDe('ESTAÇÃO DE PESQUISA - CAMBARA/JOAQUIM', ''), 'cambara-joaquim-tavora')
  assertEquals(unidadeDe('', 'Coordenacao de Estacao de Pesquisa - Xambre'), 'umuarama-xambre')
  assertEquals(unidadeDe('Assessor do Polo de Pesquisa Curitiba -', ''), 'polo-curitiba')
  assertEquals(unidadeDe('', 'Coordenacao do Polo de Pesquisa de Paranavai'), 'polo-paranavai')
  assertEquals(unidadeDe('Unidade Florestal Doutor Ulysses', ''), 'uf-doutor-ulysses')
  assertEquals(unidadeDe('Unidade Florestal de Castro', ''), 'uf-castro')
  assertEquals(unidadeDe('Regional de Curitiba', ''), null)
})

Deno.test('limpaEspecialidade e tituloCargo', () => {
  assertEquals(limpaEspecialidade('EAGO - Engenharia Agronômica'), 'Engenharia Agronômica')
  assertEquals(limpaEspecialidade('ADM- Administrador'), 'Administrador')
  assertEquals(limpaEspecialidade('Pesquisador'), 'Pesquisador')
  assertEquals(limpaEspecialidade('.'), '')
  assertEquals(tituloCargo('ENGENHEIRO AGRONOMO'), 'Engenheiro Agronomo')
  assertEquals(tituloCargo('GRADUAÇÃO COM DOUTORADO'), 'Graduação com Doutorado')
})

Deno.test('isExtensionista: só Extensão Rural, sem apoio administrativo', () => {
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Engenharia Agronômica'), true)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Assist. Administrativo'), false)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Auxiliar'), false)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Aux.limpeza'), false)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Tratorista'), false)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', 'Classificador de Produtos'), true)
  assertEquals(isExtensionista('Diretoria de Extensao Rural', ''), true)
  assertEquals(isExtensionista('Diretoria de Pesquisa e Inovacao', 'Pesquisador'), false)
})

Deno.test('casaPortal: homônimo sem desempate pela lotação não casa', () => {
  const idx = indexaPortal(parseSemicolonCsv(PORTAL, PORTAL_COLS))
  assertEquals(casaPortal(idx, 'Homonimo Repetido', 'Irati'), null)
  assertEquals(casaPortal(idx, 'Homonimo Repetido', 'Castro')?.cargo, 'ENGENHEIRO AGRONOMO')
  assertEquals(casaPortal(idx, 'Ciclano Silva', 'Guarapuava')?.cargo, 'ENGENHEIRO AGRONOMO') // SEAB ignorada
})

Deno.test('buildServidores: minimiza, enriquece e descarta linhas de controle', () => {
  const s = servidores()
  assertEquals(s.map((x) => x.id), ['900001', '1234', '1235', '900002', '1236'])
  const [fulana, ciclano, joao, maria, homonimo] = s
  assertEquals(fulana.formacao, 'Engenharia Agronômica')
  assertEquals(fulana.formacao_fonte, 'sispont')
  assertEquals(ciclano.municipio, 'Guarapuava')
  assertEquals(ciclano.formacao, 'Engenheiro Agronomo')
  assertEquals(ciclano.formacao_fonte, 'portal')
  assertEquals(ciclano.admissao, '1990-01-02')
  assertEquals(ciclano.extensionista, true)
  assertEquals(joao.extensionista, false)
  assertEquals(maria.unidade, 'londrina-ibipora')
  assertEquals(maria.extensionista, false)
  assertEquals(homonimo.formacao_fonte, null)
  // Nada de RG, chefia ou ato formal no payload.
  const json = JSON.stringify(s)
  for (const proibido of ['11111111', 'BELTRANO', 'Chefia', 'RG']) {
    assertEquals(json.includes(proibido), false, proibido)
  }
})
