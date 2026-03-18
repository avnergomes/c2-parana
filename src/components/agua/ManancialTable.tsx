// src/components/agua/ManancialTable.tsx
import { useState, useMemo } from 'react'
import type { Manancial } from '@/types/manancial'
import { disponibilidadeToColor, disponibilidadeToLabel } from '@/types/manancial'

interface ManancialTableProps {
  mananciais: Manancial[]
  loading: boolean
}

type SortKey = 'municipio' | 'rio' | 'vazao_m3s' | 'disponibilidade' | 'chuva_mm' | 'temp_max' | 'alerta'

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'municipio', label: 'Município' },
  { key: 'rio', label: 'Rio' },
  { key: 'vazao_m3s', label: 'Vazão (m³/s)', align: 'right' },
  { key: 'disponibilidade', label: 'Disponibilidade' },
  { key: 'chuva_mm', label: 'Chuva (mm)', align: 'right' },
  { key: 'temp_max', label: 'Temp (°C)', align: 'right' },
  { key: 'alerta', label: 'Alerta' },
]

const DISP_ORDER: Record<string, number> = { critico: 0, baixo: 1, normal: 2, alto: 3 }

export function ManancialTable({ mananciais, loading }: ManancialTableProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('alerta')
  const [sortAsc, setSortAsc] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = q
      ? mananciais.filter(m =>
          m.municipio.toLowerCase().includes(q) ||
          m.rio.toLowerCase().includes(q) ||
          m.sistema.toLowerCase().includes(q)
        )
      : mananciais

    return [...list].sort((a, b) => {
      let av: number | string
      let bv: number | string

      if (sortKey === 'disponibilidade') {
        av = DISP_ORDER[a.disponibilidade ?? ''] ?? 99
        bv = DISP_ORDER[b.disponibilidade ?? ''] ?? 99
      } else if (sortKey === 'alerta') {
        av = a.alerta ? 0 : 1
        bv = b.alerta ? 0 : 1
      } else if (sortKey === 'municipio' || sortKey === 'rio') {
        av = a[sortKey]
        bv = b[sortKey]
      } else {
        av = a[sortKey] ?? -Infinity
        bv = b[sortKey] ?? -Infinity
      }

      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [mananciais, search, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'municipio' || key === 'rio')
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
        placeholder="Buscar por município, rio ou sistema..."
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
              <tr key={m.locationid} className="border-b border-border/50 hover:bg-background-elevated/50 transition-colors">
                <td className="px-4 py-2.5 text-text-primary">{m.municipio}</td>
                <td className="px-4 py-2.5 text-text-secondary text-xs">{m.rio}</td>
                <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                  {m.vazao_m3s != null ? m.vazao_m3s.toFixed(3) : '—'}
                  {m.tendencia && (
                    <span className={`ml-1 ${m.tendencia === 'subindo' ? 'text-status-success' : m.tendencia === 'descendo' ? 'text-status-danger' : 'text-text-muted'}`}>
                      {m.tendencia === 'subindo' ? '▲' : m.tendencia === 'descendo' ? '▼' : '—'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: disponibilidadeToColor(m.disponibilidade) + '22', color: disponibilidadeToColor(m.disponibilidade) }}
                  >
                    {disponibilidadeToLabel(m.disponibilidade)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {m.chuva_mm != null ? `${m.chuva_mm.toFixed(1)}` : '—'}
                  {m.prob_chuva != null && (
                    <span className="text-text-muted text-xs ml-1">({(m.prob_chuva * 100).toFixed(0)}%)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-text-secondary">
                  {m.temp_min != null && m.temp_max != null
                    ? `${m.temp_min}–${m.temp_max}`
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {m.alerta && (
                    <span className="text-status-danger text-lg" title="Vazão abaixo de Q1">⚠</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-6 text-center text-text-muted">Nenhum manancial encontrado.</p>
        )}
      </div>

      <p className="text-text-muted text-xs">{filtered.length} de {mananciais.length} mananciais</p>
    </div>
  )
}
