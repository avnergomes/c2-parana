// src/components/saude/AlertasMunicipios.tsx
import { useState } from 'react'
import { useDengueAtual } from '@/hooks/useSaude'
import { DENGUE_ALERT_CONFIG } from '@/types/saude'

type SortKey = 'cases' | 'alert_level' | 'municipality_name'

export function AlertasMunicipios() {
  const [sortKey, setSortKey] = useState<SortKey>('cases')
  const [filter, setFilter] = useState<number | null>(null)
  const { data: dengueData, isLoading } = useDengueAtual()

  const sorted = [...(dengueData || [])]
    .filter(d => filter === null || d.alert_level === filter)
    .sort((a, b) => {
      if (sortKey === 'municipality_name') return (a.municipality_name || '').localeCompare(b.municipality_name || '')
      return (b[sortKey] || 0) - (a[sortKey] || 0)
    })

  const alertaCountByLevel = dengueData?.reduce((acc, d) => {
    acc[d.alert_level] = (acc[d.alert_level] || 0) + 1
    return acc
  }, {} as Record<number, number>) || {}

  return (
    <div className="card">
      {/* Filtros */}
      <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter(null)} className={`text-xs px-3 py-1 rounded-full border transition-all ${filter === null ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-border text-text-secondary'}`}>
          Todos ({dengueData?.length || 0})
        </button>
        {[3, 2, 1, 0].map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${filter === level ? 'border-current bg-current/10' : 'border-border text-text-secondary'}`}
            style={{ color: filter === level ? (DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG] || DENGUE_ALERT_CONFIG[0]).color : undefined }}
          >
            {(DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG] || DENGUE_ALERT_CONFIG[0]).label} ({alertaCountByLevel[level] || 0})
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-card">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('municipality_name')}>Município</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('cases')}>Casos</th>
              <th className="text-center py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('alert_level')}>Alerta</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Inc./100k</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={4} className="py-2 px-4"><div className="h-3 bg-background-elevated rounded w-full animate-pulse" /></td>
                </tr>
              ))
            ) : (
              sorted.slice(0, 50).map(d => {
                const config = DENGUE_ALERT_CONFIG[d.alert_level as keyof typeof DENGUE_ALERT_CONFIG] || DENGUE_ALERT_CONFIG[0]
                return (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                    <td className="py-2 px-4 text-text-primary text-xs">{d.municipality_name || d.ibge_code}</td>
                    <td className="py-2 px-4 text-right font-mono text-xs font-semibold text-text-primary">{d.cases}</td>
                    <td className="py-2 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-2xs font-medium" style={{ color: config.color }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-2xs text-text-muted font-mono">
                      {d.incidence_rate?.toFixed(1) || '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
