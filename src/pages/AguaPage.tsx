// src/pages/AguaPage.tsx
import { useState } from 'react'
import { useReservatorios, useReservatorioKpis, useMananciais } from '@/hooks/useInfoHidro'
import { ReservatorioCard } from '@/components/agua/ReservatorioCard'
import { DisponibilidadeWidget } from '@/components/agua/DisponibilidadeWidget'
import { ManancialKpis } from '@/components/agua/ManancialKpis'
import { ManancialTable } from '@/components/agua/ManancialTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { LiveIndicator } from '@/components/ui/LiveIndicator'

type Tab = 'mananciais' | 'saic' | 'disponibilidade'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mananciais', label: 'Mananciais (291)' },
  { key: 'saic', label: 'Reservatórios SAIC' },
  { key: 'disponibilidade', label: 'Disponibilidade' },
]

export function AguaPage() {
  const { isPro } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('mananciais')
  const { data: reservatorios, isLoading } = useReservatorios()
  const { data: kpis } = useReservatorioKpis()
  const { data: mananciais, isLoading: mananciaisLoading } = useMananciais()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Recursos Hídricos" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Recursos Hídricos</h1>
          <p className="text-text-secondary text-sm mt-1">InfoHidro/SIMEPAR — Mananciais e reservatórios do Paraná</p>
        </div>
        <LiveIndicator />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-accent-green text-accent-green'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Mananciais */}
      {activeTab === 'mananciais' && (
        <ErrorBoundary moduleName="mananciais">
          <ManancialKpis />
          <ManancialTable mananciais={mananciais ?? []} loading={mananciaisLoading} />
        </ErrorBoundary>
      )}

      {/* Tab: SAIC */}
      {activeTab === 'saic' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Volume médio"
              value={kpis ? `${kpis.volume_medio_percent}%` : '—'}
              accentColor={kpis && kpis.volume_medio_percent < 50 ? 'red' : kpis && kpis.volume_medio_percent < 70 ? 'yellow' : 'blue'}
              loading={isLoading}
            />
            <KpiCard
              label="Em alerta"
              value={kpis?.reservatorios_em_alerta ?? '—'}
              accentColor={kpis && kpis.reservatorios_em_alerta > 0 ? 'red' : 'green'}
              loading={isLoading}
            />
            <KpiCard
              label="Reservatórios"
              value={kpis?.total_reservatorios ?? '—'}
              accentColor="blue"
              loading={isLoading}
            />
            <KpiCard
              label="Volume total"
              value={kpis ? `${kpis.volume_total_hm3} hm³` : '—'}
              accentColor="blue"
              loading={isLoading}
            />
          </div>

          {/* Reservoir cards */}
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Reservatórios SAIC
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="card p-4 animate-pulse">
                    <div className="h-4 bg-background-elevated rounded w-24 mb-3" />
                    <div className="h-6 bg-background-elevated rounded w-16 mb-3" />
                    <div className="h-2 bg-background-elevated rounded mb-3" />
                    <div className="h-16 bg-background-elevated rounded" />
                  </div>
                ))}
              </div>
            ) : reservatorios && reservatorios.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reservatorios.map(r => (
                  <ErrorBoundary key={r.nome} moduleName={`reservatório ${r.nome}`}>
                    <ReservatorioCard reservatorio={r} />
                  </ErrorBoundary>
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <p className="text-text-muted">Dados de reservatórios não disponíveis.</p>
                <p className="text-text-muted text-xs mt-1">Execute o ETL para popular os dados do InfoHidro.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab: Disponibilidade */}
      {activeTab === 'disponibilidade' && (
        <ErrorBoundary moduleName="disponibilidade hídrica">
          <DisponibilidadeWidget />
        </ErrorBoundary>
      )}
    </div>
  )
}
