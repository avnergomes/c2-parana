// src/components/ambiente/CemadenAlertsTable.tsx
// Fase 5.A — tabela de alertas CEMADEN ativos
import { AlertTriangle, Link as LinkIcon, MapPin } from 'lucide-react'
import {
  useCemadenAlerts,
  type CemadenAlert,
  type CemadenSeverity,
} from '@/hooks/useCemadenAlerts'
import { timeAgo } from '@/lib/utils'

const SEVERITY_CONFIG: Record<CemadenSeverity, { label: string; color: string; icon: string }> = {
  observacao: { label: 'Observação', color: '#3b82f6', icon: '●' },
  atencao: { label: 'Atenção', color: '#eab308', icon: '▲' },
  alerta: { label: 'Alerta', color: '#f97316', icon: '◆' },
  alerta_maximo: { label: 'Alerta Máximo', color: '#ef4444', icon: '■' },
}

const TYPE_LABEL: Record<string, string> = {
  geologico: 'Geológico',
  hidrologico: 'Hidrológico',
  meteorologico: 'Meteorológico',
  movimento_massa: 'Movimento de Massa',
  alagamento: 'Alagamento',
  inundacao: 'Inundação',
  enxurrada: 'Enxurrada',
  erosao: 'Erosão',
  outro: 'Outro',
}

export function CemadenAlertsTable() {
  const { data: alerts, isLoading } = useCemadenAlerts({
    days: 3,
    onlyActive: true,
    limit: 50,
  })

  const totalBySeverity: Record<CemadenSeverity, number> = {
    observacao: 0,
    atencao: 0,
    alerta: 0,
    alerta_maximo: 0,
  }
  for (const a of alerts ?? []) {
    totalBySeverity[a.severity] += 1
  }

  return (
    <div className="card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-warning" />
          Alertas CEMADEN (Defesa Civil Nacional)
        </h3>
        <div className="flex gap-2">
          {(['alerta_maximo', 'alerta', 'atencao'] as const).map((sev) => {
            const cfg = SEVERITY_CONFIG[sev]
            return (
              <span
                key={sev}
                className="text-2xs font-medium px-2 py-0.5 rounded-full border"
                style={{
                  color: cfg.color,
                  borderColor: `${cfg.color}50`,
                  background: `${cfg.color}15`,
                }}
                title={cfg.label}
              >
                {cfg.icon} {totalBySeverity[sev]}
              </span>
            )
          })}
        </div>
      </div>

      <div className="overflow-auto max-h-72">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-background-elevated rounded animate-pulse"
              />
            ))}
          </div>
        ) : (alerts ?? []).length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">
            Sem alertas CEMADEN ativos nas últimas 72h no Paraná.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background-card">
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 text-text-muted text-xs font-medium">
                  Município
                </th>
                <th className="text-left py-2 px-4 text-text-muted text-xs font-medium">
                  Tipo
                </th>
                <th className="text-center py-2 px-4 text-text-muted text-xs font-medium">
                  Severidade
                </th>
                <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">
                  Emitido
                </th>
              </tr>
            </thead>
            <tbody>
              {(alerts ?? []).map((alert) => (
                <CemadenAlertRow key={alert.id} alert={alert} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CemadenAlertRow({ alert }: { alert: CemadenAlert }) {
  const cfg = SEVERITY_CONFIG[alert.severity]
  return (
    <tr className="border-b border-border/50 hover:bg-background-elevated transition-colors">
      <td className="py-2 px-4">
        <p className="text-xs text-text-primary font-medium flex items-center gap-1">
          <MapPin size={12} className="text-text-muted" />
          {alert.municipality || '—'}
        </p>
        {alert.description && (
          <p className="text-2xs text-text-muted line-clamp-1 mt-0.5">
            {alert.description}
          </p>
        )}
      </td>
      <td className="py-2 px-4 text-xs text-text-secondary">
        {TYPE_LABEL[alert.alert_type] ?? alert.alert_type}
      </td>
      <td className="py-2 px-4 text-center">
        <span
          className="text-2xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: cfg.color,
            borderColor: `${cfg.color}50`,
            background: `${cfg.color}15`,
          }}
        >
          {cfg.icon} {cfg.label}
        </span>
      </td>
      <td className="py-2 px-4 text-right text-2xs text-text-muted">
        <div className="flex items-center justify-end gap-2">
          <span>{timeAgo(alert.issued_at)}</span>
          {alert.source_url && (
            <a
              href={alert.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-accent-green"
              title="Abrir fonte oficial"
            >
              <LinkIcon size={10} />
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}
