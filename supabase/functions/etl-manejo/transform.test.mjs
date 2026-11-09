import assert from 'node:assert/strict';
import test from 'node:test';
import { armadilhas, chaveData, coletores, construir, limites, pluviometros, pulverizacoes, resumoErroLogin, safraAtual, talhoes, wktParaGeometria } from './transform.js';

const base = { fieldId: 'f1', propertyId: 'p1', produtorId: 'ID-PRODUTOR', tecnicosIds: 'ID-TECNICO', municipio: 'São João do Ivaí', produtor: 'Conceição', latitude: -24.5, longitude: -51.5 };

test('erro de login expõe campos, nunca o corpo ecoado', () => {
  assert.equal(resumoErroLogin({ message: 'SENHA-SECRETA', code: 1 }), 'chaves message,code');
  assert.equal(resumoErroLogin(null), 'sem JSON');
});

test('erro de login Celebrate/Joi: campo e regra, nunca valor citado', () => {
  const faltando = { statusCode: 400, validation: { body: { source: 'body', keys: ['cpf'], message: '"cpf" is required' } } };
  assert.equal(resumoErroLogin(faltando), 'body:cpf:"cpf" is required');
  const email = { validation: { body: { keys: ['email'], message: '"email" must be a valid email' } } };
  assert.equal(resumoErroLogin(email), 'body:email:"email" must be a valid email');
  const eco = { validation: { body: { keys: ['user'], message: '"user" with value "SENHA-SECRETA" fails to match the required pattern' } } };
  assert.equal(resumoErroLogin(eco), 'body:user:regra omitida');
});

test('datas dd/mm/aaaa ordenam como ISO', () => {
  assert.equal(chaveData('05/11/2026'), '2026-11-05');
  assert.equal(chaveData('2026-11-05T10:00:00Z'), '2026-11-05T10:00:00Z');
});

test('safra corrente: ignora a futura e vira só no 2º semestre', () => {
  const safras = [{ id: 'a', name: 'Safra 2025/2026' }, { id: 'b', name: 'Safra 2026/2027' }, { id: 'c', name: 'Safra 2027/2028' }];
  assert.equal(safraAtual(safras, new Date('2026-11-08')).id, 'b');
  assert.equal(safraAtual(safras, new Date('2027-01-15')).id, 'b');
  assert.equal(safraAtual([], new Date('2026-11-08')), null);
});

test('coletor leva IDs, sem o texto dos limites', () => {
  const p = coletores([{ ...base, limite_talhao: 'T', limite_propriedade: 'P' }]).features[0].properties;
  assert.deepEqual([p.produtorId, p.tecnicosIds, p.limite_talhao, p.limite_propriedade], ['ID-PRODUTOR', 'ID-TECNICO', undefined, undefined]);
});

test('coletor leva o IBGE do município; sem casamento o campo fica de fora', () => {
  const ibgeDe = (m) => (m === 'São João do Ivaí' ? '4125209' : undefined);
  const [casou, semCasar] = coletores([base, { ...base, municipio: 'Outro' }], ibgeDe).features.map((f) => f.properties);
  assert.equal(casou.ibge, '4125209');
  assert.equal(casou.municipio, 'São João do Ivaí');
  assert.equal('ibge' in semCasar, false);
});

const QUADRADO ='POLYGON((-52.1 -24.1, -52.0 -24.1, -52.0 -24.0, -52.1 -24.1))';

test('WKT vira geometria; texto ruim ou fora do Paraná vira null', () => {
  assert.deepEqual(wktParaGeometria(QUADRADO).coordinates[0][1], [-52, -24.1]);
  const multi = wktParaGeometria(`MULTIPOLYGON(${QUADRADO.slice(7)},((-51 -24,-50.9 -24,-50.9 -23.9,-51 -24)))`);
  assert.equal(multi.type, 'MultiPolygon');
  assert.equal(multi.coordinates.length, 2);
  assert.equal(wktParaGeometria('POLYGON((-52 -24, -51 -24))'), null);
  assert.equal(wktParaGeometria('POLYGON((10 10, 11 10, 11 11, 10 10))'), null);
  assert.equal(wktParaGeometria('POINT(-52 -24)'), null);
  assert.equal(wktParaGeometria(null), null);
});

test('limites: propriedade repetida entre talhões vira um polígono, desenhada por baixo', () => {
  const gj = limites([
    { ...base, limite_talhao: QUADRADO, limite_propriedade: 'POLYGON((-52.2 -24.2,-52 -24.2,-52 -24,-52.2 -24.2))' },
    { ...base, limite_talhao: 'lixo', limite_propriedade: 'POLYGON((-52.2 -24.2,-52 -24.2,-52 -24,-52.2 -24.2))' },
  ]);
  assert.deepEqual(gj.features.map((f) => f.properties.tipo), ['propriedade', 'talhao']);
  assert.equal(gj.features[0].properties.produtorId, 'ID-PRODUTOR');
  assert.equal(gj.features[0].properties.cultura, undefined);
});

test('talhões juntam MID e MIP pelo fieldId e só levam os IDs pedidos', () => {
  const gj = talhoes(
    [{ ...base, area: 10 }],
    [{ fieldId: 'f1', total_ferrugem: 3, ultima_amostra: '2026-11-01' }],
    [{ fieldId: 'f1', total_percevejos: 7 }],
  );
  const p = gj.features[0].properties;
  assert.deepEqual(gj.features[0].geometry.coordinates, [-51.5, -24.5]);
  assert.equal(p.total_ferrugem, 3);
  assert.equal(p.total_percevejos, 7);
  assert.equal(p.municipio, 'São João do Ivaí');
  assert.equal(p.produtorId, 'ID-PRODUTOR');
  assert.equal(p.tecnicosIds, 'ID-TECNICO');
  assert.ok(!JSON.stringify(gj).includes('propertyId'));
});

test('coordenada nula ou fora do Paraná não vira ponto', () => {
  const ruins = [{ ...base, latitude: null }, { ...base, latitude: 0, longitude: 0 }, { ...base, latitude: -10 }];
  assert.equal(coletores(ruins).features.length, 0);
  assert.equal(armadilhas(ruins).features.length, 0);
});

test('armadilha: uma feição por local, soma indivíduos por praga', () => {
  const gj = armadilhas([
    { ...base, praga: 'Percevejo', numero_individuos: 2, data_coleta: '01/11/2026' },
    { ...base, praga: 'Lagarta', numero_individuos: 5, data_coleta: '08/11/2026' },
    { ...base, praga: 'Percevejo', numero_individuos: null, data_coleta: '15/10/2026' },
  ]);
  assert.equal(gj.features.length, 1);
  const p = gj.features[0].properties;
  assert.equal(p.coletas, 3);
  assert.equal(p.individuos, 7);
  assert.equal(p.ultima_coleta, '08/11/2026');
  assert.deepEqual(p.pragas[0], { praga: 'Lagarta', individuos: 5 });
});

test('pulverização: mistura de tanque conta uma aplicação só', () => {
  const gj = pulverizacoes([
    { ...base, numero_aplicacao: 1, produto_comercial: 'A', data_aplicacao: '2026-10-01' },
    { ...base, numero_aplicacao: 1, produto_comercial: 'B', data_aplicacao: '2026-10-01' },
    { ...base, numero_aplicacao: 2, produto_comercial: 'C', data_aplicacao: '2026-11-01' },
  ]);
  const p = gj.features[0].properties;
  assert.equal(p.aplicacoes, 2);
  assert.equal(p.ultima_aplicacao, '2026-11-01');
  assert.equal(p.registros[0].produto_comercial, 'C');
});

test('pluviômetro sem leitura ainda aparece, com zero', () => {
  const p = pluviometros([{ ...base, data_leitura: null, precipitacao_mm: null }]).features[0].properties;
  assert.equal(p.leituras, 0);
  assert.equal(p.chuva_total_mm, 0);
  const q = pluviometros([
    { ...base, data_leitura: '2026-11-01', precipitacao_mm: 10 },
    { ...base, data_leitura: '2026-11-02', precipitacao_mm: 2.5 },
  ]).features[0].properties;
  assert.equal(q.chuva_total_mm, 12.5);
  assert.equal(q.ultima_leitura, '2026-11-02');
});

test('construir devolve os 6 arquivos do bucket', () => {
  const vazio = { general: [], mid: [], mip: [], coletores: [], armadilhas: [], pulverizacoes: [], pluviometros: [] };
  assert.deepEqual(Object.keys(construir(vazio)).sort(), [
    'manejo-armadilhas.geojson', 'manejo-coletores.geojson', 'manejo-limites.geojson', 'manejo-pluviometros.geojson',
    'manejo-pulverizacoes.geojson', 'manejo-talhoes.geojson',
  ]);
});
