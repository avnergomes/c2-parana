// src/components/agua/DisponibilidadeWidget.tsx
import { useDisponibilidadeHidrica } from '@/hooks/useInfoHidro'
import { formatDate } from '@/lib/utils'

export function DisponibilidadeWidget() {
  const { data: series, isLoading } = useDisponibilidadeHidrica()

  if (isLoading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-background-elevated rounded w-48 mb-4" />
        <div className="h-32 bg-background-elevated rounded" />
      </div>
    )
  }

  if (!series || series.length === 0) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Disponibilidade Hídrica
        </h3>
        <p className="text-text-muted text-sm">Dados não disponíveis</p>
      </div>
    )
  }

  // Show most recent entries
  const recent = series.slice(0, 10)

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Disponibilidade Hídrica
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 pr-4">Data</th>
              <th className="text-right py-2 px-2">Q1 (m³/s)</th>
              <th className="text-right py-2 pl-2">Q30 (m³/s)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(d => (
              <tr key={`${d.locationid}-${d.date}`} className="border-b border-border/50">
                <td className="py-1.5 pr-4 text-text-secondary">{formatDate(d.date)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-text-primary">{d.q1.toFixed(2)}</td>
                <td className="py-1.5 pl-2 text-right font-mono text-text-primary">{d.q30.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-text-muted mt-2">
        Q1 = vazão mínima (seca), Q30 = vazão mediana. Fonte: InfoHidro/SIMEPAR
      </p>
    </div>
  )
}
