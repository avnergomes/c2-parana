// src/pages/AmbientePage.tsx
import { useFireSpots, useRiverLevels, useAirQuality } from '@/hooks/useAmbiente'
import { useCemadenActiveCountBySeverity } from '@/hooks/useCemadenAlerts'
import { QualidadeArCards } from '@/components/ambiente/QualidadeArCard'
import { FireTrendChart } from '@/components/ambiente/FireTrendChart'
import { RiosTable } from '@/components/ambiente/RiosTable'
import { CemadenAlertsTable } from '@/components/ambiente/CemadenAlertsTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { LiveIndicator } from '@/components/ui/LiveIndicator'

export function AmbientePage() {
  const { isPro } = useAuth()
  const { data: fires, isLoading: loadingFires } = useFireSpots(7)
  const { data: rios } = useRiverLevels()
  const { data: aqData } = useAirQuality()
  const { data: cemadenCounts } = useCemadenActiveCountBySeverity()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Meio Ambiente" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  const riosEmAlerta = rios?.filter(r => r.alert_level !== 'normal').length || 0
  const aqiMedio = aqData?.length
    ? Math.round(aqData.reduce((s, a) => s + (a.aqi || 0), 0) / aqData.length)
    : null
  const cemadenAtivos =
    (cemadenCounts?.alerta_maximo ?? 0) +
    (cemadenCounts?.alerta ?? 0) +
    (cemadenCounts?.atencao ?? 0)
  const cemadenAccent: 'red' | 'yellow' | 'green' =
    (cemadenCounts?.alerta_maximo ?? 0) > 0 || (cemadenCounts?.alerta ?? 0) > 0
      ? 'red'
      : (cemadenCounts?.atencao ?? 0) > 0
        ? 'yellow'
        : 'green'

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Meio Ambiente</h1>
          <p className="text-text-secondary text-sm mt-1">NASA FIRMS · ANA Telemetria · AQICN · CEMADEN</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Focos ativos (7d)"
          value={fires?.length ?? '—'}
          accentColor={fires && fires.length > 50 ? 'red' : fires && fires.length > 10 ? 'yellow' : 'green'}
          loading={loadingFires}
        />
        <KpiCard
          label="Rios em alerta"
          value={riosEmAlerta}
          accentColor={riosEmAlerta > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="AQI médio PR"
          value={aqiMedio ?? '—'}
          accentColor={aqiMedio && aqiMedio > 100 ? 'red' : aqiMedio && aqiMedio > 50 ? 'yellow' : 'green'}
        />
        <KpiCard
          label="CEMADEN ativos (24h)"
          value={cemadenAtivos}
          accentColor={cemadenAccent}
        />
        <KpiCard
          label="Cobertura monitoramento"
          value={aqData?.length ? `${aqData.length} cidades` : '—'}
          accentColor="blue"
        />
      </div>

      {/* Qualidade do Ar */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Qualidade do Ar</h2>
        <ErrorBoundary moduleName="qualidade do ar">
          <QualidadeArCards />
        </ErrorBoundary>
      </div>

      {/* Trend de focos + Tabela de rios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary moduleName="focos de calor trend">
          <FireTrendChart />
        </ErrorBoundary>
        <ErrorBoundary moduleName="rios">
          <RiosTable />
        </ErrorBoundary>
      </div>

      {/* Alertas CEMADEN */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Alertas Oficiais da Defesa Civil
        </h2>
        <ErrorBoundary moduleName="cemaden">
          <CemadenAlertsTable />
        </ErrorBoundary>
      </div>
    </div>
  )
}
