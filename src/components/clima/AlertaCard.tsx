// src/components/clima/AlertaCard.tsx
import type { AlertaINMET } from '@/types/clima'
import { SEVERITY_CONFIG } from '@/types/clima'
import { formatDateTime } from '@/lib/utils'

interface AlertaCardProps {
  alerta: AlertaINMET
}

export function AlertaCard({ alerta }: AlertaCardProps) {
  const config = SEVERITY_CONFIG[alerta.severity]

  return (
    <div
      className="card p-4 border-l-2"
      style={{ borderLeftColor: config.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={config.badgeClass}>{config.label}</span>
            {alerta.is_active && (
              <span className="badge-success text-2xs">Ativo</span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-text-primary leading-tight">{alerta.title}</h4>
          {alerta.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{alerta.description}</p>
          )}
        </div>
      </div>

      {alerta.affected_municipalities && alerta.affected_municipalities.length > 0 && (
        <p className="text-2xs text-text-muted mt-2">
          {alerta.affected_municipalities.length} município(s) afetado(s)
        </p>
      )}

      <div className="flex items-center gap-3 mt-2 text-2xs text-text-muted">
        {alerta.starts_at && <span>Início: {formatDateTime(alerta.starts_at)}</span>}
        {alerta.ends_at && <span>Fim: {formatDateTime(alerta.ends_at)}</span>}
      </div>
    </div>
  )
}
