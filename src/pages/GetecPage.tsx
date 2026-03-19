// src/pages/GetecPage.tsx
import { useState } from 'react'
import { useGetecKpis, useGetecMunicipios, useGetecAtendimentos, useGetecTimeline } from '@/hooks/useGetec'
import { GetecOverview } from '@/components/getec/GetecOverview'
import { GetecMunicipios } from '@/components/getec/GetecMunicipios'
import { GetecExtensao } from '@/components/getec/GetecExtensao'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'

type Tab = 'overview' | 'municipios' | 'extensao'

export function GetecPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { isPro } = useAuth()

  const { data: kpis, isLoading: loadingKpis } = useGetecKpis()
  const { data: municipios, isLoading: loadingMunicipios } = useGetecMunicipios()
  const { data: atendimentosMap } = useGetecAtendimentos()
  const { data: timeline } = useGetecTimeline()

  if (!isPro) {
    return (
      <div className="p-6">
        <PaywallModal feature="GETEC" requiredPlan="pro" onClose={() => history.back()} />
      </div>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'municipios', label: 'Por Município' },
    { id: 'extensao', label: 'Extensão Rural' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">GETEC — Extensão Rural</h1>
        <p className="text-text-secondary text-sm mt-1">Clientes IDR-Paraná · Municípios · Assistência Técnica</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-accent-green text-accent-green'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        <ErrorBoundary moduleName={activeTab}>
          {activeTab === 'overview' && (
            <GetecOverview kpis={kpis!} loading={loadingKpis} atendimentosMap={atendimentosMap} timeline={timeline} />
          )}
          {activeTab === 'municipios' && (
            <GetecMunicipios municipios={municipios || []} loading={loadingMunicipios} />
          )}
          {activeTab === 'extensao' && <GetecExtensao />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
