// supabase/functions/_shared/pr_geo.ts
//
// Ponto -> municipio do PR por ponto-no-poligono, sobre a malha de
// _shared/pr_geometria.ts. Substitui o "centroide mais proximo ate 80 km"
// no matching dos focos FIRMS, que jogava ~28% da area do PR para o
// municipio vizinho e atribuia a municipios paranaenses focos de SP, SC,
// MS e do Paraguai/Argentina.
//
// A malha e simplificada (~19 vertices por municipio), mas as divisas
// internas sao compartilhadas vertice a vertice (sem frestas). Regra:
//   1. ponto dentro de um poligono -> esse municipio (o primeiro, na ordem
//      do IBGE, se cair numa sobreposicao);
//   2. senao, a borda mais proxima a ate `toleranciaKm` (padrao 0,5 km) ->
//      esse municipio; empate a menos de 1e-9 km fica com o primeiro na
//      ordem do IBGE, para Deno e Python nao divergirem no ultimo bit;
//   3. senao -> null: o ponto esta fora do PR e deve ser descartado.
// A tolerancia so age na divisa estadual e na costa: recupera ponto
// paranaense que a simplificacao deixou de fora, ao custo de aceitar ponto
// vizinho a menos de 0,5 km. Cidades coladas na divisa (Porto Uniao-SC,
// Barra do Turvo-SP) ficam dentro dessa margem; Mafra-SC, Puerto Iguazu e
// Bernardo de Irigoyen-AR e Ciudad del Este-PY ficam fora.
// Mesma regra em scripts/pr_geo.py (a especificacao Python).

import { PR_ANEIS } from './pr_geometria.ts'

export interface MunicipioPR {
  ibge: string
  nome: string
}

interface Anel {
  ibge: string
  nome: string
  coords: readonly number[]
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

const ANEIS: Anel[] = PR_ANEIS.map(([ibge, nome, coords]) => {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (let i = 0; i < coords.length; i += 2) {
    minLon = Math.min(minLon, coords[i])
    maxLon = Math.max(maxLon, coords[i])
    minLat = Math.min(minLat, coords[i + 1])
    maxLat = Math.max(maxLat, coords[i + 1])
  }
  return { ibge, nome, coords, minLon, minLat, maxLon, maxLat }
})

const KM_POR_GRAU_LAT = 110.574
const KM_POR_GRAU_LON_EQUADOR = 111.32
export const TOLERANCIA_KM = 0.5
const EMPATE_KM = 1e-9

/** Ray casting (regra par-impar) sobre um anel lon,lat achatado. */
export function pontoNoAnel(lon: number, lat: number, coords: readonly number[]): boolean {
  let dentro = false
  const n = coords.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = coords[2 * i]
    const yi = coords[2 * i + 1]
    const xj = coords[2 * j]
    const yj = coords[2 * j + 1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

/** Distancia (km) do ponto a borda do anel, em projecao equiretangular local. */
export function distanciaAoAnelKm(lon: number, lat: number, coords: readonly number[]): number {
  const kx = KM_POR_GRAU_LON_EQUADOR * Math.cos((lat * Math.PI) / 180)
  const ky = KM_POR_GRAU_LAT
  let melhor = Infinity
  const n = coords.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = (coords[2 * j] - lon) * kx
    const ay = (coords[2 * j + 1] - lat) * ky
    const bx = (coords[2 * i] - lon) * kx
    const by = (coords[2 * i + 1] - lat) * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const px = ax + t * dx
    const py = ay + t * dy
    melhor = Math.min(melhor, Math.hypot(px, py))
  }
  return melhor
}

/** Municipio do PR que contem o ponto, ou null se ele estiver fora do PR. */
export function municipioDoPonto(lat: number, lon: number, toleranciaKm = TOLERANCIA_KM): MunicipioPR | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  for (const a of ANEIS) {
    if (lon < a.minLon || lon > a.maxLon || lat < a.minLat || lat > a.maxLat) continue
    if (pontoNoAnel(lon, lat, a.coords)) return { ibge: a.ibge, nome: a.nome }
  }
  if (toleranciaKm <= 0) return null
  const folgaLat = toleranciaKm / KM_POR_GRAU_LAT
  const folgaLon = toleranciaKm / (KM_POR_GRAU_LON_EQUADOR * Math.cos((lat * Math.PI) / 180))
  let melhor: Anel | null = null
  let melhorKm = toleranciaKm + EMPATE_KM
  for (const a of ANEIS) {
    if (
      lon < a.minLon - folgaLon ||
      lon > a.maxLon + folgaLon ||
      lat < a.minLat - folgaLat ||
      lat > a.maxLat + folgaLat
    ) {
      continue
    }
    const d = distanciaAoAnelKm(lon, lat, a.coords)
    if (d < melhorKm - EMPATE_KM) {
      melhorKm = d
      melhor = a
    }
  }
  return melhor ? { ibge: melhor.ibge, nome: melhor.nome } : null
}
