// src/components/ambiente/RiosTable.tsx
import { useRiverLevels } from '@/hooks/useAmbiente'
import { RIVER_ALERT_CONFIG } from '@/types/ambiente'
import { timeAgo } from '@/lib/utils'

export function RiosTable() {
  const { data: rios, isLoading } = useRiverLevels()

  const alertas = rios?.filter(r => r.alert_level !== 'normal') || []
  const normais = rios?.filter(r => r.alert_level === 'normal') || []

  return (
    <div className="card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Nível dos Rios (ANA)</h3>
        <div className="flex gap-2">
          {(['emergency', 'alert', 'attention'] as const).map(level => (
            <span key={level} className="text-2xs font-medium px-2 py-0.5 rounded-full border"
              style={{ color: RIVER_ALERT_CONFIG[level].color, borderColor: RIVER_ALERT_CONFIG[level].color + '50', background: RIVER_ALERT_CONFIG[level].color + '15' }}>
              {RIVER_ALERT_CONFIG[level].icon} {alertas.filter(r => r.alert_level === level).length}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-card">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-4 text-text-muted text-xs font-medium">Estação / Rio</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Nível</th>
              <th className="text-center py-2 px-4 text-text-muted text-xs font-medium">Status</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Atualização</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={4} className="py-2 px-4"><div className="h-3 bg-background-elevated rounded animate-pulse" /></td>
                </tr>
              ))
            ) : (
              [...alertas, ...normais].slice(0, 30).map(rio => {
                const config = RIVER_ALERT_CONFIG[rio.alert_level]
                return (
                  <tr key={rio.id} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                    <td className="py-2 px-4">
                      <p className="text-xs text-text-primary font-medium">{rio.station_name}</p>
                      {rio.river_name && <p className="text-2xs text-text-muted">{rio.river_name}</p>}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-text-primary">
                      {rio.level_cm !== null ? `${rio.level_cm.toFixed(0)} cm` : '—'}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className="text-xs" style={{ color: config.color }}>{config.icon} {config.label}</span>
                    </td>
                    <td className="py-2 px-4 text-right text-2xs text-text-muted">{timeAgo(rio.observed_at)}</td>
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
