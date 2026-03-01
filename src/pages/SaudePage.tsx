// src/pages/SaudePage.tsx
import { useSaudeKpis, useLeitosSUS } from '@/hooks/useSaude'
import { DengueMapaCoro } from '@/components/saude/DengueMapaCoro'
import { AlertasMunicipios } from '@/components/saude/AlertasMunicipios'
import { DengueSerieTemporal } from '@/components/saude/DengueSerieTemporal'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber } from '@/lib/utils'

export function SaudePage() {
  const { isPro } = useAuth()
  const { data: kpis, isLoading } = useSaudeKpis()
  const { data: leitos } = useLeitosSUS()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Saúde" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Saúde</h1>
        <p className="text-text-secondary text-sm mt-1">
          InfoDengue · OpenDataSUS · SE {kpis?.semana_epidemiologica || '—'}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Casos Dengue (semana)"
          value={kpis ? formatNumber(kpis.total_casos_semana) : '—'}
          trend={kpis?.variacao_semana}
          accentColor={kpis && kpis.variacao_semana > 20 ? 'red' : 'yellow'}
          loading={isLoading}
        />
        <KpiCard
          label="Municípios em alerta"
          value={kpis ? kpis.municipios_alerta : '—'}
          subvalue={`${kpis?.municipios_epidemia || 0} em epidemia`}
          accentColor={kpis && kpis.municipios_epidemia > 0 ? 'red' : 'yellow'}
          loading={isLoading}
        />
        <KpiCard
          label="Leitos SUS PR"
          value={leitos ? formatNumber(leitos.total_leitos) : '—'}
          subvalue={leitos?.leitos_uti ? `${formatNumber(leitos.leitos_uti)} UTI` : undefined}
          accentColor="blue"
        />
        <KpiCard
          label="Ocupação UTI"
          value={leitos?.ocupacao_uti_pct ? `${leitos.ocupacao_uti_pct.toFixed(0)}%` : '—'}
          accentColor={leitos?.ocupacao_uti_pct && leitos.ocupacao_uti_pct > 80 ? 'red' : 'green'}
        />
      </div>

      {/* Grid: Mapa + Série temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary moduleName="mapa dengue">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Dengue por Município</h2>
            <DengueMapaCoro />
          </div>
        </ErrorBoundary>
        <ErrorBoundary moduleName="série temporal dengue">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Evolução Semanal</h2>
            <DengueSerieTemporal />
          </div>
        </ErrorBoundary>
      </div>

      {/* Tabela de alertas */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Municípios com Alertas</h2>
        <ErrorBoundary moduleName="alertas municípios">
          <AlertasMunicipios />
        </ErrorBoundary>
      </div>
    </div>
  )
}
