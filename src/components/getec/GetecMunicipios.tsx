// src/components/getec/GetecMunicipios.tsx
import { useState, useMemo } from 'react'
import { formatNumber } from '@/lib/utils'
import type { GetecMunicipio } from '@/types/getec'

interface GetecMunicipiosProps {
  municipios: GetecMunicipio[]
  loading: boolean
}

type SortKey = 'municipio' | 'total' | 'ativos' | 'inativos' | 'taxa_atividade' | 'masculino' | 'feminino'

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'municipio', label: 'Município' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'ativos', label: 'Ativos', align: 'right' },
  { key: 'inativos', label: 'Inativos', align: 'right' },
  { key: 'taxa_atividade', label: 'Taxa (%)', align: 'right' },
  { key: 'masculino', label: 'Masc', align: 'right' },
  { key: 'feminino', label: 'Fem', align: 'right' },
]

export function GetecMunicipios({ municipios, loading }: GetecMunicipiosProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortAsc, setSortAsc] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = q
      ? municipios.filter(m => m.municipio.toLowerCase().includes(q))
      : municipios

    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [municipios, search, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'municipio')
    }
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-6 bg-background-elevated rounded w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Buscar município..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-field w-full max-w-sm"
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-accent-green">{sortAsc ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.municipio_code} className="border-b border-border/50 hover:bg-background-elevated/50 transition-colors">
                <td className="px-4 py-2.5 text-text-primary">{m.municipio}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-primary">{formatNumber(m.total)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-status-success">{formatNumber(m.ativos)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-muted">{formatNumber(m.inativos)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{m.taxa_atividade.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{formatNumber(m.masculino)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{formatNumber(m.feminino)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-6 text-center text-text-muted">Nenhum município encontrado.</p>
        )}
      </div>

      <p className="text-text-muted text-xs">{filtered.length} de {municipios.length} municípios</p>
    </div>
  )
}
