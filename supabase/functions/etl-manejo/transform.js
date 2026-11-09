// supabase/functions/etl-manejo/transform.js
//
// Linhas dos relatórios do Manejo.App -> GeoJSON das camadas do DataGeo.
// JS puro para o teste rodar com `node --test`, sem Deno.
//
// LGPD: lista de campos permitidos por camada; arquivos só no bucket privado.

const PR = { south: -27, north: -22, west: -55.5, east: -47.5 };

const COMUNS = ['municipio', 'hierarquia', 'produtor', 'produtorId', 'tecnicosIds', 'cultura', 'cultivar', 'safra', 'instituicao', 'responsavel_tecnico'];

const MAX_REGISTROS = 30;

const escolher = (row, campos) =>
  Object.fromEntries(campos.filter((c) => row[c] !== null && row[c] !== undefined && row[c] !== '').map((c) => [c, row[c]]));

function coord(row) {
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  const ok = lat >= PR.south && lat <= PR.north && lon >= PR.west && lon <= PR.east;
  return ok ? [lon, lat] : null;
}

const feature = (coordinates, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });
const fc = (features) => ({ type: 'FeatureCollection', features });
const numero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

/**
 * Erro 400/422 do login -> só nomes de campo e tipo do erro. Validadores
 * costumam ecoar o corpo recebido, então nenhum valor da resposta é copiado.
 */
export function resumoErroLogin(j) {
  if (j?.validation && typeof j.validation === 'object' && !Array.isArray(j.validation)) {
    // Celebrate/Joi: a mensagem pode citar o valor enviado, só passa regra conhecida.
    const seguro = /^"[\w.]+" (is required|is not allowed( to be empty)?|must be (a valid \w+|a string))$/;
    return Object.entries(j.validation).map(([fonte, v]) => {
      const msg = String(v?.message ?? '');
      return `${fonte}:${(v?.keys ?? []).join('+')}:${seguro.test(msg) ? msg : 'regra omitida'}`;
    }).join(',');
  }
  return j && typeof j === 'object' ? `chaves ${Object.keys(j).join(',')}` : 'sem JSON';
}

/** Chave ordenável de data: aceita ISO e dd/mm/aaaa. */
export function chaveData(v) {
  const s = String(v ?? '');
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

const maisRecentePrimeiro = (rows, campo) =>
  [...rows].sort((a, b) => chaveData(b[campo]).localeCompare(chaveData(a[campo])));

/** Uma lista de linhas por local (a mesma armadilha/talhão repete a coordenada). */
function porLocal(rows, chave) {
  const grupos = new Map();
  for (const row of rows) {
    const c = coord(row);
    if (!c) continue;
    const k = `${row[chave]}|${c.join(',')}`;
    grupos.set(k, { coord: c, rows: [...(grupos.get(k)?.rows ?? []), row] });
  }
  return [...grupos.values()];
}

/** Safra corrente: a de maior ano inicial já iniciada (o ciclo vira no 2º semestre). */
export function safraAtual(safras, agora = new Date()) {
  const seisMesesAtras = new Date(agora.getTime() - 182 * 86_400_000).getUTCFullYear();
  const comAno = safras
    .map((safra) => ({ safra, ano: Number(/(\d{4})\/\d{4}/.exec(Object.values(safra).map(String).join(' '))?.[1]) }))
    .filter((s) => s.ano && s.ano <= seisMesesAtras)
    .sort((a, b) => b.ano - a.ano);
  return comAno[0]?.safra ?? null;
}

export function talhoes(general, mid, mip) {
  const idx = (rows) => new Map(rows.map((r) => [r.fieldId, r]));
  const [unicos, doMid, doMip] = [idx(general), idx(mid), idx(mip)];
  return fc([...unicos.values()].flatMap((g) => {
    const c = coord(g);
    if (!c) return [];
    const d = doMid.get(g.fieldId) ?? {};
    const p = doMip.get(g.fieldId) ?? {};
    return [feature(c, {
      ...escolher(g, [...COMUNS, 'area', 'produtividade', 'data_emergencia', 'monitoramento_encerrado', 'mid', 'mip', 'has_collector', 'has_trap']),
      ...escolher(d, ['total_ferrugem', 'total_oidio', 'total_alvo', 'total_aplicacoes', 'dae_primeira_ferrugem']),
      ...escolher(p, ['total_lagartas', 'total_percevejos']),
      ultima_amostra_mid: d.ultima_amostra ?? null,
      ultima_amostra_mip: p.ultima_amostra ?? null,
    })];
  }));
}

/** `ibgeDe`: nome do município -> código IBGE; sem casamento o campo fica de fora. */
export function coletores(pontos, ibgeDe = () => null) {
  return fc(pontos.flatMap((r) => {
    const c = coord(r);
    return c ? [feature(c, escolher({ ...r, ibge: ibgeDe(r.municipio) }, [...COMUNS, 'ibge', 'estadio_fenologico', 'situacao', 'data_instalacao', 'primeiro_esporo']))] : [];
  }));
}

/** POLYGON/MULTIPOLYGON em WKT -> geometria GeoJSON; null se inválido ou fora do Paraná. */
export function wktParaGeometria(wkt) {
  const m = /^\s*(MULTI)?POLYGON\s*(\(.*\))\s*$/is.exec(String(wkt ?? ''));
  if (!m) return null;
  const num = String.raw`-?[\d.]+(?:e-?\d+)?`;
  const texto = m[2].replace(new RegExp(`(${num})\\s+(${num})`, 'gi'), '[$1,$2]').replace(/\(/g, '[').replace(/\)/g, ']');
  let coordinates;
  try {
    coordinates = JSON.parse(texto);
  } catch {
    return null;
  }
  const poligonos = m[1] ? coordinates : [coordinates];
  const aneis = poligonos.flat();
  const ok = aneis.every((a) => a.length >= 4) && aneis.flat().every(([longitude, latitude]) => coord({ longitude, latitude }));
  return ok ? { type: m[1] ? 'MultiPolygon' : 'Polygon', coordinates } : null;
}

const CAMPOS_PROPRIEDADE = ['municipio', 'hierarquia', 'produtor', 'produtorId', 'tecnicosIds', 'safra', 'instituicao', 'responsavel_tecnico'];

/** Polígonos de propriedade e talhão, sem repetição; propriedade antes, para ficar por baixo. */
export function limites(rows) {
  const porTipo = (campo, tipo, campos) =>
    [...new Map(rows.filter((r) => r[campo]).map((r) => [r[campo], r]))].flatMap(([wkt, r]) => {
      const geometry = wktParaGeometria(wkt);
      return geometry ? [{ type: 'Feature', geometry, properties: { tipo, ...escolher(r, campos) } }] : [];
    });
  return fc([...porTipo('limite_propriedade', 'propriedade', CAMPOS_PROPRIEDADE), ...porTipo('limite_talhao', 'talhao', COMUNS)]);
}

export function armadilhas(rows) {
  return fc(porLocal(rows, 'fieldId').map(({ coord: c, rows: rs }) => {
    const ordenadas = maisRecentePrimeiro(rs, 'data_coleta');
    const porPraga = new Map();
    for (const r of rs) porPraga.set(r.praga, (porPraga.get(r.praga) ?? 0) + numero(r.numero_individuos));
    return feature(c, {
      ...escolher(ordenadas[0], [...COMUNS, 'data_instalacao', 'estadio']),
      coletas: rs.length,
      individuos: rs.reduce((s, r) => s + numero(r.numero_individuos), 0),
      ultima_coleta: ordenadas[0].data_coleta ?? null,
      pragas: [...porPraga].map(([praga, individuos]) => ({ praga, individuos })).sort((a, b) => b.individuos - a.individuos),
    });
  }));
}

export function pulverizacoes(rows) {
  return fc(porLocal(rows, 'fieldId').map(({ coord: c, rows: rs }) => {
    const ordenadas = maisRecentePrimeiro(rs, 'data_aplicacao');
    return feature(c, {
      ...escolher(ordenadas[0], [...COMUNS, 'area']),
      // Uma aplicação pode ter vários produtos (mistura de tanque).
      aplicacoes: new Set(rs.map((r) => r.numero_aplicacao)).size,
      ultima_aplicacao: ordenadas[0].data_aplicacao ?? null,
      registros: ordenadas.slice(0, MAX_REGISTROS).map((r) =>
        escolher(r, ['data_aplicacao', 'numero_aplicacao', 'alvo', 'produto_comercial', 'ingrediente_ativo', 'dose', 'dae', 'estadio_fenologico'])),
    });
  }));
}

export function pluviometros(rows) {
  return fc(porLocal(rows, 'propertyId').map(({ coord: c, rows: rs }) => {
    const leituras = maisRecentePrimeiro(rs.filter((r) => r.data_leitura), 'data_leitura');
    const base = leituras[0] ?? rs[0];
    return feature(c, {
      ...escolher(base, ['municipio', 'hierarquia', 'produtor', 'produtorId', 'tecnicosIds', 'culturas', 'safras', 'instituicao', 'responsavel_tecnico', 'area_total', 'data_instalacao', 'dias_sem_chuva', 'acumulado_mensal_mm']),
      leituras: leituras.length,
      chuva_total_mm: leituras.reduce((s, r) => s + numero(r.precipitacao_mm), 0),
      ultima_leitura: base.data_leitura ?? null,
    });
  }));
}

/** @returns {Record<string, object>} arquivo do bucket -> FeatureCollection */
export function construir({ general, mid, mip, coletores: pts, armadilhas: arm, pulverizacoes: pul, pluviometros: plu }, ibgeDe) {
  return {
    'manejo-talhoes.geojson': talhoes(general, mid, mip),
    'manejo-coletores.geojson': coletores(pts, ibgeDe),
    'manejo-limites.geojson': limites(pts),
    'manejo-armadilhas.geojson': armadilhas(arm),
    'manejo-pulverizacoes.geojson': pulverizacoes(pul),
    'manejo-pluviometros.geojson': pluviometros(plu),
  };
}
