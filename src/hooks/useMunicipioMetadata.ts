// src/hooks/useMunicipioMetadata.ts
// Fase 5.D — metadados estáticos por município (lookup local + IBGE se necessário)
import { useQuery } from '@tanstack/react-query'

export interface MunicipioMetadata {
  ibge: string
  name: string
  uf: string
}

let lookupCache: Map<string, MunicipioMetadata> | null = null

interface GeojsonProps {
  codarea?: string
  CD_MUN?: string
  NM_MUN?: string
  codigo_ibg?: string
  id?: string
  nome?: string
  name?: string
}

async function loadLookup(): Promise<Map<string, MunicipioMetadata>> {
  if (lookupCache) return lookupCache
  // Respeita o base path do Vite (/c2-parana/ em prod, / em dev)
  const baseUrl = import.meta.env.BASE_URL || '/'
  const geojsonUrl = `${baseUrl.replace(/\/$/, '')}/data/municipios-pr.geojson`
  const resp = await fetch(geojsonUrl)
  if (!resp.ok) throw new Error(`Falha ao carregar geojson: ${geojsonUrl} (HTTP ${resp.status})`)
  const geojson = (await resp.json()) as {
    features: Array<{ properties?: GeojsonProps }>
  }
  const map = new Map<string, MunicipioMetadata>()
  for (const f of geojson.features ?? []) {
    const props = f.properties ?? {}
    const ibge =
      props.codarea ?? props.CD_MUN ?? props.codigo_ibg ?? props.id
    const name = props.NM_MUN ?? props.nome ?? props.name
    if (ibge && name) {
      map.set(String(ibge), { ibge: String(ibge), name, uf: 'PR' })
    }
  }
  lookupCache = map
  return map
}

export function useMunicipioMetadata(ibge: string | null | undefined) {
  return useQuery({
    queryKey: ['municipio-metadata', ibge],
    enabled: Boolean(ibge),
    queryFn: async (): Promise<MunicipioMetadata | null> => {
      if (!ibge) return null
      const map = await loadLookup()
      return map.get(ibge) ?? null
    },
    staleTime: 1000 * 60 * 60 * 24,
  })
}

export function useAllMunicipios() {
  return useQuery({
    queryKey: ['municipios-all'],
    queryFn: async () => {
      const map = await loadLookup()
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
    staleTime: 1000 * 60 * 60 * 24,
  })
}
