import assert from 'node:assert/strict';
import test from 'node:test';
import { armadilhas, chaveData, coletores, construir, pluviometros, pulverizacoes, safraAtual, talhoes } from './transform.js';

const base = { fieldId: 'f1', propertyId: 'p1', produtorId: 'ID-PRODUTOR', tecnicosIds: 'ID-TECNICO', municipio: 'São João do Ivaí', produtor: 'Conceição', latitude: -24.5, longitude: -51.5 };

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

test('coletor leva IDs e limites', () => {
  const p = coletores([{ ...base, limite_talhao: 'T', limite_propriedade: 'P' }]).features[0].properties;
  assert.deepEqual([p.produtorId, p.tecnicosIds, p.limite_talhao, p.limite_propriedade], ['ID-PRODUTOR', 'ID-TECNICO', 'T', 'P']);
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

test('construir devolve os 5 arquivos do bucket', () => {
  const vazio = { general: [], mid: [], mip: [], coletores: [], armadilhas: [], pulverizacoes: [], pluviometros: [] };
  assert.deepEqual(Object.keys(construir(vazio)).sort(), [
    'manejo-armadilhas.geojson', 'manejo-coletores.geojson', 'manejo-pluviometros.geojson',
    'manejo-pulverizacoes.geojson', 'manejo-talhoes.geojson',
  ]);
});
