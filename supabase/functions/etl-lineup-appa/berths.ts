// supabase/functions/etl-lineup-appa/berths.ts
//
// O line-up da APPA não traz coordenadas. Posições APROXIMADAS derivadas do
// OpenStreetMap (© colaboradores do OpenStreetMap, ODbL) em 2026-09-13:
// - 201-219: face de atracação do cais comercial (relation 7714317, ~3,45 km),
//   berços distribuídos de oeste para leste e deslocados ~45 m para a água;
// - 141-144: eixo do píer de inflamáveis (way 10793688);
// - 200/200A: eixo do píer FOSPAR (way 695717879);
// - 113/114: eixo do píer da Ponta do Félix, Antonina (way 378019579);
// - fundeadouros: centróide das áreas seamark:type=anchorage da baía.
// A numeração real dos berços pode não ser uniforme ao longo do cais: o mapa
// deve rotular a posição como aproximada.

export interface BerthInfo {
  lat: number
  lon: number
  local: string
  /** Rumo (graus a partir do norte) do eixo do cais/píer: navio atracado fica paralelo a ele. */
  rumo: number
}

const CAIS = 'Cais comercial de Paranaguá'
// [lat, lon, rumo]: rumo pelos berços vizinhos ao longo da face do cais.
const CAIS_POS: Array<[number, number, number]> = [
  [-25.50147, -48.52546, 95], [-25.50162, -48.52365, 95], [-25.50176, -48.52185, 95], [-25.50191, -48.52005, 95],
  [-25.50205, -48.51825, 95], [-25.5022, -48.51645, 95], [-25.50235, -48.51464, 89], [-25.50216, -48.51285, 83],
  [-25.50196, -48.51105, 83], [-25.50176, -48.50926, 83], [-25.50157, -48.50746, 83], [-25.50137, -48.50566, 83],
  [-25.50116, -48.50387, 82], [-25.50092, -48.50208, 82], [-25.50069, -48.50029, 82], [-25.50046, -48.4985, 82],
  [-25.50022, -48.49671, 82], [-25.49999, -48.49492, 79], [-25.49957, -48.49317, 75],
]

export const BERTHS: Readonly<Record<string, BerthInfo>> = Object.freeze({
  ...Object.fromEntries(CAIS_POS.map(([lat, lon, rumo], i) => [String(201 + i), { lat, lon, rumo, local: CAIS }])),
  '141': { lat: -25.50275, lon: -48.53556, rumo: 320, local: 'Píer de inflamáveis (Paranaguá)' },
  '142': { lat: -25.50219, lon: -48.53609, rumo: 320, local: 'Píer de inflamáveis (Paranaguá)' },
  '143': { lat: -25.50163, lon: -48.53661, rumo: 320, local: 'Píer de inflamáveis (Paranaguá)' },
  '144': { lat: -25.50108, lon: -48.53714, rumo: 320, local: 'Píer de inflamáveis (Paranaguá)' },
  '200': { lat: -25.50344, lon: -48.54265, rumo: 314, local: 'Píer FOSPAR (Paranaguá)' },
  '200A': { lat: -25.50178, lon: -48.54458, rumo: 314, local: 'Píer FOSPAR (Paranaguá)' },
  '113': { lat: -25.45681, lon: -48.67507, rumo: 135, local: 'Ponta do Félix (Antonina)' },
  '114': { lat: -25.45751, lon: -48.6743, rumo: 135, local: 'Ponta do Félix (Antonina)' },
})

/** Centróides dos fundeadouros usados para navios "ao largo" (baía, fora do canal interno). */
export const ANCHORAGES: ReadonlyArray<{ nome: string; lat: number; lon: number }> = Object.freeze([
  { nome: '5', lat: -25.49939, lon: -48.46363 },
  { nome: '6', lat: -25.48972, lon: -48.46556 },
  { nome: '7', lat: -25.49978, lon: -48.44694 },
  { nome: '9', lat: -25.50348, lon: -48.4215 },
  { nome: '8', lat: -25.50085, lon: -48.40361 },
])

export interface VesselPosition {
  lat: number
  lon: number
  tipo: 'berco' | 'fundeio'
  local: string
  /** Rumo do eixo do navio em graus; null quando desconhecido (fundeio). */
  rumo: number | null
}

/** Posição de navio atracado pelo número do berço; null se o berço não é conhecido. */
export function berthPosition(berco: string | null | undefined): VesselPosition | null {
  const key = String(berco ?? '').trim().toUpperCase()
  const info = BERTHS[key]
  return info
    ? { lat: info.lat, lon: info.lon, tipo: 'berco', local: `Berço ${key} · ${info.local}`, rumo: info.rumo }
    : null
}

/**
 * Posição ilustrativa de navio ao largo: o line-up não diz em qual
 * fundeadouro ele está. Distribui por índice entre as áreas e em anel ao
 * redor do centróide (~350 m por navio), de forma determinística.
 */
export function anchoragePosition(index: number): VesselPosition {
  const area = ANCHORAGES[index % ANCHORAGES.length]
  const slot = Math.floor(index / ANCHORAGES.length)
  const angle = (slot * 137.5 * Math.PI) / 180 // espiral de ângulo áureo: não sobrepõe
  const radiusDeg = slot === 0 ? 0 : 0.0032 * Math.sqrt(slot)
  return {
    lat: Number((area.lat + radiusDeg * Math.sin(angle)).toFixed(5)),
    lon: Number((area.lon + radiusDeg * Math.cos(angle)).toFixed(5)),
    tipo: 'fundeio',
    local: `Área de fundeio ${area.nome} (posição ilustrativa)`,
    // Navio fundeado gira com maré e vento: rumo desconhecido.
    rumo: null,
  }
}
