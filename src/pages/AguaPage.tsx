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
import { useInfoHidroExpandedSummary } from '@/hooks/useInfoHidroExpandido'

type Tab = 'mananciais' | 'saic' | 'disponibilidade' | 'dados-ambientais'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mananciais', label: 'Mananciais (291)' },
  { key: 'saic', label: 'Reservatorios SAIC' },
  { key: 'disponibilidade', label: 'Disponibilidade' },
  { key: 'dados-ambientais', label: 'Dados Ambientais' },
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

      {/* Tab: Dados Ambientais (InfoHidro expandido - Fase 3.H) */}
      {activeTab === 'dados-ambientais' && (
        <ErrorBoundary moduleName="dados ambientais">
          <DadosAmbientaisTab />
        </ErrorBoundary>
      )}
    </div>
  )
}

const DOMAIN_COLORS: Record<string, string> = {
  telemetria: 'border-l-accent-blue',
  conservacao: 'border-l-accent-green',
  incendio: 'border-l-status-warning',
  qualidade: 'border-l-[#8b5cf6]',
  ambiental: 'border-l-[#06b6d4]',
}

const DOMAIN_LABELS: Record<string, string> = {
  telemetria: 'Telemetria Expandida',
  conservacao: 'Conservacao / Uso do Solo',
  incendio: 'Focos de Incendio',
  qualidade: 'Qualidade da Agua',
  ambiental: 'Monitoramento Ambiental',
}

function DadosAmbientaisTab() {
  const { sections, health, lastFetch, isLoading } = useInfoHidroExpandedSummary()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 animate-pulse"><div className="h-12 bg-background-elevated rounded" /></div>
        ))}
      </div>
    )
  }

  // Group sections by domain
  const byDomain = new Map<string, typeof sections>()
  for (const s of sections) {
    const existing = byDomain.get(s.domain) || []
    existing.push(s)
    byDomain.set(s.domain, existing)
  }

  const totalRecords = sections.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-6">
      {/* Health summary */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        {health && (
          <>
            <span className={health.status === 'success' ? 'text-accent-green' : 'text-status-warning'}>
              {health.sections_ok}/{health.sections_total} secoes OK
            </span>
            <span>{health.duration_seconds}s</span>
          </>
        )}
        {lastFetch && <span>Atualizado: {new Date(lastFetch).toLocaleString('pt-BR')}</span>}
        <span className="font-mono">{totalRecords.toLocaleString('pt-BR')} registros total</span>
      </div>

      {/* Sections by domain */}
      {Array.from(byDomain.entries()).map(([domain, items]) => (
        <div key={domain}>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            {DOMAIN_LABELS[domain] || domain}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => (
              <div
                key={item.label}
                className={`card p-3 border-l-2 ${DOMAIN_COLORS[domain] || 'border-l-border'}`}
              >
                <p className="text-2xs text-text-muted uppercase">{item.label}</p>
                <p className="text-lg font-bold text-text-primary mt-1">
                  {item.count > 0 ? item.count.toLocaleString('pt-BR') : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
