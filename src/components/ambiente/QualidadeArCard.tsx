// src/components/ambiente/QualidadeArCard.tsx
import { AQI_CONFIG, getAqiCategory } from '@/types/ambiente'
import { CIDADES_AR } from '@/types/ambiente'
import { timeAgo } from '@/lib/utils'
import { useAirQuality } from '@/hooks/useAmbiente'

export function QualidadeArCards() {
  const { data: aqData, isLoading } = useAirQuality()

  const byCity = CIDADES_AR.map(city => {
    const record = aqData?.find(a => a.city === city.id)
    return { ...city, record }
  })

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {byCity.map(city => {
        const aqi = city.record?.aqi
        const category = aqi !== null && aqi !== undefined ? getAqiCategory(aqi) : null
        const config = category ? AQI_CONFIG[category] : null

        return (
          <div key={city.id} className="card p-4 border-t-2" style={{ borderTopColor: config?.color || '#374151' }}>
            <p className="text-xs font-semibold text-text-secondary">{city.label}</p>
            {isLoading ? (
              <div className="animate-pulse mt-2">
                <div className="h-8 bg-background-elevated rounded w-16 mb-1" />
                <div className="h-3 bg-background-elevated rounded w-20" />
              </div>
            ) : city.record && aqi !== null ? (
              <>
                <p className="text-3xl font-mono font-bold mt-2" style={{ color: config?.color }}>
                  {aqi}
                </p>
                <p className="text-xs font-medium mt-1" style={{ color: config?.color }}>
                  {config?.label}
                </p>
                <p className="text-2xs text-text-muted mt-0.5">
                  {city.record.dominant_pollutant && `Principal: ${city.record.dominant_pollutant} · `}
                  {timeAgo(city.record.observed_at)}
                </p>
                {(city.record.pm25 || city.record.pm10) && (
                  <div className="flex gap-3 mt-2 text-2xs text-text-muted">
                    {city.record.pm25 && <span>PM2.5: {city.record.pm25.toFixed(1)}</span>}
                    {city.record.pm10 && <span>PM10: {city.record.pm10.toFixed(1)}</span>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-text-muted text-xs mt-2">Sem dados</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
