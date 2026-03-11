// src/pages/ClimaPage.tsx
import { useState } from 'react'
import { useEstacoesPR, useAlertasINMET } from '@/hooks/useClima'
import { EstacaoCard } from '@/components/clima/EstacaoCard'
import { AlertaCard } from '@/components/clima/AlertaCard'
import { TempoSerieChart } from '@/components/clima/TempoSerieChart'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { ESTACOES_PRINCIPAIS } from '@/types/clima'

export function ClimaPage() {
  const [selectedStation, setSelectedStation] = useState('A807')
  const { data: estacoes, isLoading: loadingEstacoes } = useEstacoesPR()
  const { data: alertas, isLoading: loadingAlertas } = useAlertasINMET()

  const principaisEstacoes = (estacoes || []).filter(e =>
    Object.keys(ESTACOES_PRINCIPAIS).includes(e.station_code)
  )

  const alertasAtivos = (alertas || []).filter(a => a.is_active)
  const avgTemp = estacoes?.length
    ? (estacoes.reduce((s, e) => s + (e.temperature || 0), 0) / estacoes.length).toFixed(1)
    : '—'

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Clima</h1>
          <p className="text-text-secondary text-sm mt-1">Estações INMET no Paraná · Atualização a cada 30 minutos</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Estações ativas" value={estacoes?.length ?? '—'} accentColor="blue" loading={loadingEstacoes} />
        <KpiCard label="Temp. média PR" value={`${avgTemp}°C`} accentColor="blue" loading={loadingEstacoes} />
        <KpiCard label="Alertas ativos" value={alertasAtivos.length} accentColor={alertasAtivos.length > 0 ? 'red' : 'green'} loading={loadingAlertas} />
        <KpiCard
          label="Cobertura"
          value={estacoes?.length ? `${estacoes.length} estações` : '—'}
          accentColor="green"
          loading={loadingEstacoes}
        />
      </div>

      {/* Alertas INMET */}
      {alertasAtivos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            ⚠️ Alertas Meteorológicos Ativos
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {alertasAtivos.map(alerta => (
              <ErrorBoundary key={alerta.id} moduleName="alerta card">
                <AlertaCard alerta={alerta} />
              </ErrorBoundary>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico histórico */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Histórico de Temperatura
          </h2>
          <select
            value={selectedStation}
            onChange={e => setSelectedStation(e.target.value)}
            className="input-field text-xs w-auto"
          >
            {Object.entries(ESTACOES_PRINCIPAIS).map(([code, name]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
        </div>
        <ErrorBoundary moduleName="gráfico clima">
          <TempoSerieChart
            stationCode={selectedStation}
            stationName={ESTACOES_PRINCIPAIS[selectedStation] || selectedStation}
          />
        </ErrorBoundary>
      </div>

      {/* Cards das estações principais */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Estações Principais
        </h2>
        {loadingEstacoes ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse space-y-3">
                <div className="h-4 bg-background-elevated rounded w-32" />
                <div className="h-8 bg-background-elevated rounded w-20" />
              </div>
            ))}
          </div>
        ) : principaisEstacoes.length === 0 ? (
          <div className="card p-8 text-center text-text-secondary">
            <p className="text-lg mb-2">Sem dados meteorológicos no momento</p>
            <p className="text-xs text-text-muted">A API do INMET pode estar temporariamente indisponível. O ETL tenta novamente a cada 30 minutos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {principaisEstacoes.map(estacao => (
              <button
                key={estacao.station_code}
                onClick={() => setSelectedStation(estacao.station_code)}
                className="text-left"
              >
                <EstacaoCard estacao={estacao} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Todas as estações */}
      {(estacoes?.length ?? 0) > 6 && (
        <details className="group">
          <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary list-none flex items-center gap-2">
            <svg className="w-4 h-4 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Ver todas as {estacoes?.length} estações
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
            {estacoes?.filter(e => !Object.keys(ESTACOES_PRINCIPAIS).includes(e.station_code)).map(estacao => (
              <EstacaoCard key={estacao.station_code} estacao={estacao} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
