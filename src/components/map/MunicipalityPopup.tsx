// src/components/map/MunicipalityPopup.tsx
import { useMemo } from 'react'
import { X, Thermometer, Flame, Bug, Waves } from 'lucide-react'
import { useEstacoesPR } from '@/hooks/useClima'
import { useDengueAtual } from '@/hooks/useSaude'
import { useFireSpots, useRiverLevels, useAirQuality } from '@/hooks/useAmbiente'
import { useIRTC, getIRTCColor } from '@/hooks/useIRTC'
import { DENGUE_ALERT_CONFIG } from '@/types/saude'
import { getAqiCategory, AQI_CONFIG, RIVER_ALERT_CONFIG } from '@/types/ambiente'

interface MunicipalitySituationPanelProps {
  ibgeCode: string
  name: string
  onClose: () => void
}

/**
 * Calculate distance between two coordinates (in km)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function MunicipalityPopup({ ibgeCode, name, onClose }: MunicipalitySituationPanelProps) {
  const { data: estacoes, isLoading: loadingEstacoes } = useEstacoesPR()
  const { data: dengueData } = useDengueAtual()
  const { data: fireSpots } = useFireSpots(1)
  const { data: riverLevels } = useRiverLevels()
  const { data: airQuality } = useAirQuality()
  const { data: irtcData } = useIRTC()

  const irtcScore = useMemo(() => {
    if (!irtcData) return null
    return irtcData.get(ibgeCode)
  }, [irtcData, ibgeCode])

  const muniDengueData = useMemo(() => {
    if (!dengueData) return null
    return dengueData.find(d => d.ibge_code === ibgeCode)
  }, [dengueData, ibgeCode])

  const nearestClima = useMemo(() => {
    if (!estacoes || !estacoes.length) return null
    return estacoes.find(e => e.ibge_code === ibgeCode) || estacoes[0]
  }, [estacoes, ibgeCode])

  // Count fire spots near municipality (within 100 km radius)
  const fireSpotsNearby = useMemo(() => {
    if (!fireSpots || !nearestClima?.latitude || !nearestClima?.longitude) return 0
    const lat = nearestClima.latitude
    const lon = nearestClima.longitude
    if (lat === null || lat === undefined || lon === null || lon === undefined) return 0
    return fireSpots.filter(f => {
      if (!f.latitude || !f.longitude) return false
      const distance = calculateDistance(lat, lon, f.latitude, f.longitude)
      return distance <= 100
    }).length
  }, [fireSpots, nearestClima])

  // Find nearest river level
  const nearestRiver = useMemo(() => {
    if (!riverLevels || !nearestClima?.latitude || !nearestClima?.longitude) return null
    const lat = nearestClima.latitude
    const lon = nearestClima.longitude
    if (lat === null || lat === undefined || lon === null || lon === undefined) return null

    let nearest = null as (typeof riverLevels)[number] | null
    let minDistance = Infinity
    for (const river of riverLevels) {
      if (!river.latitude || !river.longitude) continue
      const distance = calculateDistance(lat, lon, river.latitude, river.longitude)
      if (distance < minDistance && distance <= 100) {
        minDistance = distance
        nearest = river
      }
    }
    return nearest
  }, [riverLevels, nearestClima])

  // Find nearest air quality reading (by city name match or first available)
  const nearestAirQualityRecord = useMemo(() => {
    if (!airQuality || !airQuality.length) return null
    return airQuality[0] // AirQualityData doesn't have lat/lon, use first available
  }, [airQuality])

  const riskColor = irtcScore ? getIRTCColor(irtcScore.irtc) : '#9ca3af'

  return (
    <div className="fixed left-0 top-0 h-full w-[380px] bg-card/95 backdrop-blur border-r border-white/10 z-[1000] overflow-hidden flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-text-primary leading-tight">{name}</h2>
            <p className="text-xs text-text-secondary font-mono mt-1">IBGE {ibgeCode}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 p-1.5 -mr-1 rounded hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* IRTC Badge */}
        {irtcScore && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1">
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1">Índice IRTC</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-mono font-bold text-text-primary">{irtcScore.irtc.toFixed(0)}</span>
                <span className="text-xs text-text-secondary mb-0.5">/ 100</span>
              </div>
            </div>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: riskColor }}
            >
              {irtcScore.riskLevel === 'baixo' && 'Baixo'}
              {irtcScore.riskLevel === 'médio' && 'Médio'}
              {irtcScore.riskLevel === 'alto' && 'Alto'}
              {irtcScore.riskLevel === 'crítico' && 'Crítico'}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* IRTC Breakdown */}
          {irtcScore && (
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-3">Componentes de Risco</p>
              <div className="space-y-2">
                {[
                  { label: 'Clima', value: irtcScore.rClima, color: '#f59e0b' },
                  { label: 'Saúde', value: irtcScore.rSaude, color: '#ef4444' },
                  { label: 'Ambiente', value: irtcScore.rAmbiente, color: '#10b981' },
                  { label: 'Hidro', value: irtcScore.rHidro, color: '#3b82f6' },
                  { label: 'Ar', value: irtcScore.rAr, color: '#8b5cf6' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-text-secondary">{label}</span>
                      <span className="text-xs font-mono font-bold text-text-primary">{value.toFixed(0)}</span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ backgroundColor: color, width: `${Math.min(value, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clima */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Thermometer size={16} className="text-text-secondary" />
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Clima</p>
            </div>
            {loadingEstacoes ? (
              <div className="space-y-1 animate-pulse">
                <div className="h-2 bg-white/5 rounded w-20" />
                <div className="h-2 bg-white/5 rounded w-32" />
              </div>
            ) : nearestClima ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded p-2">
                  <p className="text-text-secondary text-xs mb-1">Temperatura</p>
                  <p className="font-mono font-bold text-text-primary">
                    {nearestClima.temperature !== null && nearestClima.temperature !== undefined
                      ? `${nearestClima.temperature.toFixed(1)}°C`
                      : '—'}
                  </p>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <p className="text-text-secondary text-xs mb-1">Umidade</p>
                  <p className="font-mono font-bold text-text-primary">
                    {nearestClima.humidity !== null && nearestClima.humidity !== undefined
                      ? `${nearestClima.humidity.toFixed(0)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <p className="text-text-secondary text-xs mb-1">Vento</p>
                  <p className="font-mono font-bold text-text-primary">
                    {nearestClima.wind_speed !== null && nearestClima.wind_speed !== undefined
                      ? `${nearestClima.wind_speed.toFixed(1)}m/s`
                      : '—'}
                  </p>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <p className="text-text-secondary text-xs mb-1">Chuva</p>
                  <p className="font-mono font-bold text-text-primary">
                    {nearestClima.precipitation !== null && nearestClima.precipitation !== undefined
                      ? `${nearestClima.precipitation.toFixed(1)}mm`
                      : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">Sem dados disponíveis</p>
            )}
          </div>

          {/* Saúde */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bug size={16} className="text-text-secondary" />
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Saúde - Dengue</p>
            </div>
            {muniDengueData ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: DENGUE_ALERT_CONFIG[muniDengueData.alert_level].color }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: DENGUE_ALERT_CONFIG[muniDengueData.alert_level].color }}
                  >
                    {DENGUE_ALERT_CONFIG[muniDengueData.alert_level].label} —{' '}
                    {DENGUE_ALERT_CONFIG[muniDengueData.alert_level].description}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded p-2">
                    <p className="text-text-secondary text-xs mb-1">Casos</p>
                    <p className="font-mono font-bold text-text-primary">{muniDengueData.cases}</p>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <p className="text-text-secondary text-xs mb-1">Incidência</p>
                    <p className="font-mono font-bold text-text-primary">
                      {muniDengueData.incidence_rate !== null && muniDengueData.incidence_rate !== undefined
                        ? `${muniDengueData.incidence_rate.toFixed(1)}/100k`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">Sem dados para este município</p>
            )}
          </div>

          {/* Ambiente */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Flame size={16} className="text-text-secondary" />
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Ambiente</p>
            </div>
            <div className="space-y-2">
              <div className="bg-white/5 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-text-secondary">Focos de Calor (24h)</p>
                  <span className="font-mono font-bold text-text-primary text-sm">{fireSpotsNearby}</span>
                </div>
                {fireSpotsNearby > 0 && (
                  <div className="w-full h-1 bg-red-500/30 rounded overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${Math.min((fireSpotsNearby / 10) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {nearestAirQualityRecord && nearestAirQualityRecord.aqi !== null ? (
                <div className="bg-white/5 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-text-secondary">Qualidade do Ar (AQI)</p>
                    <span
                      className="font-mono font-bold text-sm"
                      style={{ color: AQI_CONFIG[getAqiCategory(nearestAirQualityRecord.aqi)].color }}
                    >
                      {nearestAirQualityRecord.aqi}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {AQI_CONFIG[getAqiCategory(nearestAirQualityRecord.aqi)].label} — {nearestAirQualityRecord.city}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-text-secondary">Sem dados de qualidade do ar</p>
              )}
            </div>
          </div>

          {/* Hidrologia */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Waves size={16} className="text-text-secondary" />
              <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Hidrologia</p>
            </div>
            {nearestRiver ? (
              <div className="bg-white/5 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-text-secondary font-medium">{nearestRiver.station_name}</p>
                  <div
                    className="px-2 py-1 rounded text-xs font-semibold"
                    style={{
                      backgroundColor: `${RIVER_ALERT_CONFIG[nearestRiver.alert_level].color}20`,
                      color: RIVER_ALERT_CONFIG[nearestRiver.alert_level].color,
                    }}
                  >
                    {RIVER_ALERT_CONFIG[nearestRiver.alert_level].label}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div>
                    <p className="text-text-secondary text-xs mb-1">Nível</p>
                    <p className="font-mono font-bold text-text-primary">
                      {nearestRiver.level_cm !== null ? `${nearestRiver.level_cm}cm` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-secondary text-xs mb-1">Vazão</p>
                    <p className="font-mono font-bold text-text-primary">
                      {nearestRiver.flow_m3s !== null ? `${nearestRiver.flow_m3s.toFixed(0)}m³/s` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">Sem dados de rios próximos</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
