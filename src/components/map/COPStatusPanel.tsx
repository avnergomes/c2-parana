// src/components/map/COPStatusPanel.tsx
import { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Bug,
  Waves,
  Thermometer,
  Wind,
  AlertTriangle,
  Shield,
} from 'lucide-react'
import { useCOP } from '@/hooks/useCOP'

interface COPStatusPanelProps {
  onMunicipalityClick?: (ibgeCode: string) => void
}

interface SeverityCount {
  critical: number
  high: number
  medium: number
  low: number
}

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#eab308',
}


export function COPStatusPanel({ onMunicipalityClick: _onMunicipalityClick }: COPStatusPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const {
    irtcSummary,
    inmetAlerts,
    firesFires24h,
    dengueAlertMunicipalities,
    riversAlert,
    weatherStations,
    worstAirQuality,
    extremeTemperature,
    lastUpdate,
  } = useCOP()

  const inmetBySeverity = useMemo((): SeverityCount => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    if (!inmetAlerts.data) return counts

    for (const alert of inmetAlerts.data) {
      const severity = (alert.severity || 'low').toLowerCase() as keyof SeverityCount
      if (severity in counts) counts[severity]++
    }
    return counts
  }, [inmetAlerts.data])

  const latestAlertTitle = inmetAlerts.data?.[0]?.title || 'Sem alertas'

  const irtcStats = useMemo(() => {
    if (!irtcSummary?.data) {
      return { avg: 0, critical: 0, high: 0, medium: 0 }
    }
    const all = Array.from(irtcSummary.data.values())
    const avg = all.length > 0 ? all.reduce((sum, r) => sum + r.irtc, 0) / all.length : 0
    const critical = all.filter((r) => r.irtc >= 75).length
    const high = all.filter((r) => r.irtc >= 50 && r.irtc < 75).length
    const medium = all.filter((r) => r.irtc >= 25 && r.irtc < 50).length
    return { avg, critical, high, medium }
  }, [irtcSummary?.data])

  const formatTime = (iso: string | null | undefined): string => {
    if (!iso) return '--:--'
    try {
      const date = new Date(iso)
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '--:--'
    }
  }

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '--/--'
    try {
      const date = new Date(iso)
      return date.toLocaleDateString('pt-BR')
    } catch {
      return '--/--'
    }
  }

  const getTrendIcon = (direction: 'up' | 'down' | 'stable' = 'stable') => {
    if (direction === 'up') return '↑'
    if (direction === 'down') return '↓'
    return '→'
  }

  const onlineStations = useMemo(() => {
    if (!weatherStations.data) return 0
    // Estações com temperatura != null são consideradas "online"
    return weatherStations.data.filter((s: any) => s.temperature !== null && s.temperature !== undefined).length
  }, [weatherStations.data])

  const lastUpdateTime = lastUpdate || new Date().toISOString()

  return (
    <div
      className="absolute right-2 top-2 z-[1000] flex flex-col bg-card/90 backdrop-blur rounded-lg border border-gray-700 shadow-lg"
      style={{
        width: '320px',
        maxHeight: 'calc(100vh - 80px)',
        backgroundColor: '#111827cc',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-blue-400" />
          <h3 className="text-sm font-bold text-primary">Situação Operacional</h3>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          {isCollapsed ? (
            <ChevronUp size={16} className="text-secondary" />
          ) : (
            <ChevronDown size={16} className="text-secondary" />
          )}
        </button>
      </div>

      {/* Collapsed State */}
      {isCollapsed && (
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <div className="text-xs text-secondary">Painél minimizado</div>
          <div className="text-2xl font-bold text-green-400">{irtcStats.avg.toFixed(0)}</div>
        </div>
      )}

      {/* Content (when expanded) */}
      {!isCollapsed && (
        <div className="overflow-y-auto flex-1">
          {/* Resumo IRTC */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-700">
            <p className="text-xs font-semibold text-secondary mb-3">RESUMO IRTC</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative w-24 h-24 mx-auto mb-2">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full transform -rotate-90"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#1f2937"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={
                        irtcStats.avg <= 25
                          ? '#10b981'
                          : irtcStats.avg <= 50
                            ? '#f59e0b'
                            : irtcStats.avg <= 75
                              ? '#f97316'
                              : '#ef4444'
                      }
                      strokeWidth="8"
                      strokeDasharray={`${(irtcStats.avg / 100) * 251.2} 251.2`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xl font-bold text-primary">
                        {irtcStats.avg.toFixed(1)}
                      </div>
                      <div className="text-9px text-secondary">de 100</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: '#ef4444' }}
                  />
                  <span className="text-xs text-primary">
                    {irtcStats.critical}
                    <span className="text-secondary ml-1">críticos</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: '#f97316' }}
                  />
                  <span className="text-xs text-primary">
                    {irtcStats.high}
                    <span className="text-secondary ml-1">altos</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: '#f59e0b' }}
                  />
                  <span className="text-xs text-primary">
                    {irtcStats.medium}
                    <span className="text-secondary ml-1">médios</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Alertas Ativos */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-700">
            <p className="text-xs font-semibold text-secondary mb-3">ALERTAS ATIVOS INMET</p>
            <div className="flex gap-2 mb-3">
              {Object.entries(inmetBySeverity).map(([severity, count]) => (
                <div key={severity} className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS],
                    }}
                  />
                  <span className="text-xs text-primary">{count}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-secondary truncate">
              {latestAlertTitle.length > 40
                ? latestAlertTitle.substring(0, 37) + '...'
                : latestAlertTitle}
            </p>
          </div>

          {/* Indicadores Rápidos */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-700">
            <p className="text-xs font-semibold text-secondary mb-3">INDICADORES RÁPIDOS</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Focos de incêndio */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <Flame size={14} className="text-red-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Focos (24h)</div>
                  <div className="text-sm font-bold text-primary">
                    {firesFires24h?.total || 0}
                    <span className="text-9px text-secondary ml-1">
                      {getTrendIcon(firesFires24h?.trend)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dengue */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <Bug size={14} className="text-yellow-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Dengue alerta</div>
                  <div className="text-sm font-bold text-primary">{dengueAlertMunicipalities?.count || 0}</div>
                </div>
              </div>

              {/* Rios em alerta */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <Waves size={14} className="text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Rios em alerta</div>
                  <div className="text-sm font-bold text-primary">{riversAlert?.count || 0}</div>
                </div>
              </div>

              {/* Estações online */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <Thermometer size={14} className="text-orange-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Estações ON</div>
                  <div className="text-sm font-bold text-primary">{onlineStations}</div>
                </div>
              </div>

              {/* Ar */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <Wind size={14} className="text-cyan-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Pior AQI</div>
                  <div className="text-sm font-bold text-primary">
                    {worstAirQuality?.aqi || '--'}
                  </div>
                </div>
              </div>

              {/* Temperatura extrema */}
              <div className="bg-gray-800/50 rounded px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="text-xs text-secondary">Temp. máx</div>
                  <div className="text-sm font-bold text-primary">
                    {extremeTemperature?.max !== undefined
                      ? `${extremeTemperature.max.toFixed(1)}°C`
                      : '--'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Último update */}
          <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30">
            <p className="text-9px text-secondary">
              Atualizado em {formatDate(lastUpdateTime)} às {formatTime(lastUpdateTime)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
