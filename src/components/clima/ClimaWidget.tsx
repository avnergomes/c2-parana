// src/components/clima/ClimaWidget.tsx
import { useEstacaoCuritiba } from '@/hooks/useClima'
import { getWeatherCondition } from '@/types/clima'

export function ClimaWidget() {
  const { data: curitiba, isLoading } = useEstacaoCuritiba()

  if (isLoading) {
    return <div className="hidden lg:flex items-center gap-2 animate-pulse">
      <div className="h-4 w-20 bg-background-elevated rounded" />
    </div>
  }

  if (!curitiba) return null

  const condition = getWeatherCondition(curitiba.temperature, curitiba.humidity, curitiba.precipitation)

  return (
    <div className="hidden lg:flex items-center gap-2 text-xs border-r border-border pr-4 mr-2">
      <span className="text-base leading-none">{condition.split(' ')[0]}</span>
      <div>
        <span className="font-mono font-semibold text-text-primary text-sm">
          {curitiba.temperature?.toFixed(1)}°C
        </span>
        <span className="text-text-muted ml-1">CWB</span>
      </div>
      <span className="text-text-muted">|</span>
      <span className="text-text-secondary">{curitiba.humidity?.toFixed(0)}%</span>
    </div>
  )
}
