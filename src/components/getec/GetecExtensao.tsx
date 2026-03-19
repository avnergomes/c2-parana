// src/components/getec/GetecExtensao.tsx
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useGetecExtensao } from '@/hooks/useGetec'
import { formatNumber } from '@/lib/utils'
import type { ExtensaoMunicipio } from '@/hooks/useGetec'

type SortKey = 'municipio' | 'extensionistas'

export function GetecExtensao() {
  const { data, isLoading } = useGetecExtensao()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('extensionistas')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedMun, setExpandedMun] = useState<number | null>(null)

  const filtered = useMemo(() => {
    if (!data?.extensionistas_por_municipio) return []
    const q = search.toLowerCase().trim()
    const list = q
      ? data.extensionistas_por_municipio.filter(m => m.municipio.toLowerCase().includes(q))
      : data.extensionistas_por_municipio

    return [...list].sort((a, b) => {
      if (sortKey === 'municipio') {
        return sortAsc ? a.municipio.localeCompare(b.municipio) : b.municipio.localeCompare(a.municipio)
      }
      return sortAsc ? a.extensionistas - b.extensionistas : b.extensionistas - a.extensionistas
    })
  }, [data, search, sortKey, sortAsc])

  const barData = useMemo(() => {
    if (!data?.extensionistas_por_municipio) return []
    return data.extensionistas_por_municipio
      .slice(0, 15)
      .map(m => ({ name: m.municipio, total: m.extensionistas }))
  }, [data])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'municipio')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 border-l-2 border-l-accent-green animate-pulse">
              <div className="h-3 bg-background-elevated rounded w-20 mb-3" />
              <div className="h-7 bg-background-elevated rounded w-28 mb-2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-accent-green/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text-primary">Extensão Rural</h3>
        <p className="text-text-secondary text-sm max-w-md mx-auto">
          Dados ainda não disponíveis. Execute o ETL: <code className="text-accent-green">py scripts/etl_getec_extensao.py</code>
        </p>
      </div>
    )
  }

  const { kpis } = data

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ErrorBoundary>
          <KpiCard
            label="Total Extensionistas"
            value={formatNumber(kpis.total_extensionistas)}
            subvalue={`Ref. ${kpis.data_referencia}`}
            accentColor="green"
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Municípios Atendidos"
            value={formatNumber(kpis.municipios_com_extensionista)}
            subvalue={`${kpis.municipios_sem_extensionista} sem extensionista`}
            accentColor="blue"
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Média por Município"
            value={kpis.media_por_municipio.toFixed(1)}
            accentColor="green"
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Projetos / Ações"
            value={`${kpis.total_projetos} / ${kpis.total_acoes}`}
            accentColor="blue"
          />
        </ErrorBoundary>
      </div>

      {/* Bar chart: Top 15 municipalities */}
      {barData.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4">Top 15 Municípios por Extensionistas</h3>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 110, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 11 }} width={105} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(v: number) => [formatNumber(v), 'Extensionistas']}
                />
                <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
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
                <th
                  onClick={() => handleSort('municipio')}
                  className="px-4 py-3 text-left font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none"
                >
                  Município
                  {sortKey === 'municipio' && <span className="ml-1 text-accent-green">{sortAsc ? '▲' : '▼'}</span>}
                </th>
                <th
                  onClick={() => handleSort('extensionistas')}
                  className="px-4 py-3 text-right font-medium text-text-secondary cursor-pointer hover:text-text-primary select-none"
                >
                  Extensionistas
                  {sortKey === 'extensionistas' && <span className="ml-1 text-accent-green">{sortAsc ? '▲' : '▼'}</span>}
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Equipe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: ExtensaoMunicipio) => {
                const isExpanded = expandedMun === m.municipio_code
                return (
                  <tr
                    key={m.municipio_code}
                    className="border-b border-border/50 hover:bg-background-elevated/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedMun(isExpanded ? null : m.municipio_code)}
                  >
                    <td className="px-4 py-2.5 text-text-primary">{m.municipio}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-accent-green">{m.extensionistas}</td>
                    <td className="px-4 py-2.5 text-text-secondary text-xs">
                      {isExpanded ? (
                        <div className="space-y-0.5">
                          {m.nomes.map((n, i) => (
                            <div key={i}>{n}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-muted">
                          {m.nomes.length > 0
                            ? `${m.nomes[0]}${m.nomes.length > 1 ? ` +${m.nomes.length - 1}` : ''}`
                            : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-6 text-center text-text-muted">Nenhum município encontrado.</p>
          )}
        </div>

        <p className="text-text-muted text-xs">
          {filtered.length} de {data.extensionistas_por_municipio.length} municípios · Fonte: IDR-Paraná / GETEC
        </p>
      </div>
    </div>
  )
}
