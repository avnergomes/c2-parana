// src/components/clima/EstacaoCard.tsx
import type { EstacaoClima } from '@/types/clima'
import { getWeatherCondition, getWindDirection } from '@/types/clima'
import { timeAgo } from '@/lib/utils'

interface EstacaoCardProps {
  estacao: EstacaoClima
}

export function EstacaoCard({ estacao }: EstacaoCardProps) {
  const condition = getWeatherCondition(estacao.temperature, estacao.humidity, estacao.precipitation)

  return (
    <div className="card p-4 hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{estacao.station_name}</h3>
          <p className="text-2xs text-text-muted font-mono">{estacao.station_code}</p>
        </div>
        <span className="text-xl leading-none">{condition.split(' ')[0]}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-mono font-bold text-text-primary leading-none">
            {estacao.temperature?.toFixed(1) ?? '—'}°
          </p>
          <p className="text-2xs text-text-muted mt-0.5">Temperatura</p>
        </div>
        <div>
          <p className="text-base font-mono font-semibold text-accent-blue">
            {estacao.humidity?.toFixed(0) ?? '—'}%
          </p>
          <p className="text-2xs text-text-muted">Umidade</p>
        </div>
        <div>
          <p className="text-base font-mono font-semibold text-text-secondary">
            {estacao.wind_speed?.toFixed(1) ?? '—'}<span className="text-xs font-normal"> m/s</span>
          </p>
          <p className="text-2xs text-text-muted">{getWindDirection(estacao.wind_direction)}</p>
        </div>
      </div>

      {(estacao.precipitation ?? 0) > 0 && (
        <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5">
          <span className="text-accent-blue text-xs">🌧</span>
          <span className="text-xs text-accent-blue font-mono">{estacao.precipitation?.toFixed(1)} mm/h</span>
        </div>
      )}

      <p className="text-2xs text-text-muted mt-2">
        Atualizado {timeAgo(estacao.observed_at)}
      </p>
    </div>
  )
}
