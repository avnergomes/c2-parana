// src/pages/AgroPage.tsx
import { useState } from 'react'
import { useVbpKpis, useComexKpis, useEmpregoAgro, useCreditoRural } from '@/hooks/useAgro'
import { PrecosDiariosTab } from '@/components/agro/PrecosDiariosTab'
import { SerieChart } from '@/components/agro/SerieChart'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatNumber } from '@/lib/utils'

type Tab = 'precos' | 'vbp' | 'comex' | 'emprego' | 'credito'

export function AgroPage() {
  const [activeTab, setActiveTab] = useState<Tab>('precos')
  const { isPro } = useAuth()

  const { data: vbp, isLoading: loadingVbp } = useVbpKpis()
  const { data: comex, isLoading: loadingComex } = useComexKpis()
  const { data: emprego } = useEmpregoAgro()
  const { data: credito } = useCreditoRural()

  if (!isPro) {
    return (
      <div className="p-6">
        <PaywallModal feature="Agronegócio" requiredPlan="pro" onClose={() => history.back()} />
      </div>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'precos', label: 'Preços Diários' },
    { id: 'vbp', label: 'VBP' },
    { id: 'comex', label: 'ComexStat' },
    { id: 'emprego', label: 'Emprego' },
    { id: 'credito', label: 'Crédito Rural' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Agronegócio</h1>
        <p className="text-text-secondary text-sm mt-1">VBP · Preços · Exportações · Emprego · Crédito Rural</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ErrorBoundary>
          <KpiCard
            label="VBP Total PR"
            value={vbp ? formatCurrency(vbp.vbp_total_brl / 1e9, 'BRL').replace(',00', '') + ' bi' : '—'}
            subvalue={`Ref. ${vbp?.ano_referencia || '—'}`}
            trend={vbp?.variacao_yoy}
            accentColor="green"
            loading={loadingVbp}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Exportações"
            value={comex ? `US$ ${(comex.exportacoes_usd / 1e9).toFixed(1)} bi` : '—'}
            subvalue={comex?.mes_referencia}
            trend={comex?.variacao_export_yoy}
            accentColor="blue"
            loading={loadingComex}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Emprego Agro"
            value={emprego ? formatNumber(emprego.estoque_atual) : '—'}
            subvalue={emprego ? `Saldo: ${emprego.saldo_mes >= 0 ? '+' : ''}${formatNumber(emprego.saldo_mes)}` : undefined}
            trend={emprego?.variacao_yoy}
            accentColor="green"
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Crédito Rural"
            value={credito ? `R$ ${(credito.total_ano_brl / 1e9).toFixed(1)} bi` : '—'}
            trend={credito?.variacao_yoy}
            accentColor="blue"
          />
        </ErrorBoundary>
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
          {activeTab === 'precos' && <PrecosDiariosTab />}
          {activeTab === 'vbp' && vbp && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <KpiCard label="Lavoura" value={`R$ ${(vbp.vbp_lavoura_brl / 1e9).toFixed(1)} bi`} accentColor="green" />
              <KpiCard label="Pecuária" value={`R$ ${(vbp.vbp_pecuaria_brl / 1e9).toFixed(1)} bi`} accentColor="blue" />
            </div>
          )}
          {activeTab === 'emprego' && emprego?.serie && (
            <SerieChart
              data={emprego.serie
                .filter(d => d.ano_mes && d.saldo !== undefined)
                .map(d => ({ ano_mes: d.ano_mes!, value: d.saldo! }))}
              label="Saldo de Empregos Agropecuários (CAGED)"
              color="#10b981"
              formatValue={v => (v >= 0 ? '+' : '') + formatNumber(v)}
            />
          )}
          {activeTab === 'credito' && credito?.serie && (
            <SerieChart
              data={credito.serie.map(d => ({ ano_mes: d.ano_mes, value: d.valor / 1e6 }))}
              label="Crédito Rural Paraná (R$ milhões)"
              color="#8b5cf6"
              formatValue={v => `${formatNumber(v, 0)}mi`}
            />
          )}
          {activeTab === 'comex' && (
            <div className="space-y-4">
              {comex ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                      label="Exportações"
                      value={`US$ ${(comex.exportacoes_usd / 1e9).toFixed(2)} bi`}
                      accentColor="green"
                    />
                    <KpiCard
                      label="Importações"
                      value={`US$ ${(comex.importacoes_usd / 1e9).toFixed(2)} bi`}
                      accentColor="blue"
                    />
                    <KpiCard
                      label="Saldo Comercial"
                      value={`US$ ${(comex.saldo_usd / 1e9).toFixed(2)} bi`}
                      accentColor={comex.saldo_usd > 0 ? 'green' : 'red'}
                    />
                    <KpiCard
                      label="Variação Export. YoY"
                      value={`${comex.variacao_export_yoy > 0 ? '+' : ''}${comex.variacao_export_yoy.toFixed(1)}%`}
                      accentColor={comex.variacao_export_yoy > 0 ? 'green' : 'red'}
                    />
                  </div>
                  <p className="text-text-muted text-xs">
                    Fonte: MDIC ComexStat · Ref: {comex.mes_referencia || '—'}
                  </p>
                </>
              ) : (
                <div className="card p-6 text-center text-text-secondary">
                  <p>Dados ComexStat não disponíveis. Execute o ETL Agro.</p>
                </div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}
