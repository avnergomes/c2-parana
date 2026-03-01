// src/pages/Dashboard.tsx
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/ui/KpiCard'
import { useEstacoesPR, useAlertasINMET } from '@/hooks/useClima'
import { useNoticiasStats } from '@/hooks/useNoticias'
import { useFireSpots } from '@/hooks/useAmbiente'
import { useDengueAtual } from '@/hooks/useSaude'

export function DashboardPage() {
  const { user, subscription, accessStatus, isPro } = useAuth()

  // Dados reais dos módulos
  const { data: estacoes, isLoading: loadingClima } = useEstacoesPR()
  const { data: alertas, isLoading: loadingAlertas } = useAlertasINMET()
  const { data: noticiasStats, isLoading: loadingNoticias } = useNoticiasStats()
  const { data: fires, isLoading: loadingFires } = useFireSpots(1) // últimas 24h
  const { data: dengueAtual, isLoading: loadingDengue } = useDengueAtual()

  const alertasAtivos = (alertas || []).filter(a => a.is_active).length
  const noticiasUrgentes = noticiasStats?.urgentes || 0
  const focosHoje = fires?.length || 0
  const municipiosDengueAlerta = dengueAtual?.filter(d => (d.alert_level || 0) >= 1).length || 0

  // Temperatura atual de Curitiba (estação A807)
  const curitiba = estacoes?.find(e => e.station_code === 'A807')
  const tempCuritiba = curitiba?.temperature ? `${curitiba.temperature.toFixed(1)}°C` : '—'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">
          Bem-vindo ao C2 Paraná, {user?.email}
        </p>
      </div>

      {/* Status da conta + KPIs básicos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Plano"
          value={accessStatus === 'trialing' ? 'Trial' : subscription?.plan?.toUpperCase() || '—'}
          accentColor="blue"
        />
        <KpiCard
          label="Curitiba agora"
          value={tempCuritiba}
          accentColor="blue"
          loading={loadingClima}
        />
        <KpiCard
          label="Alertas INMET"
          value={alertasAtivos}
          accentColor={alertasAtivos > 0 ? 'red' : 'green'}
          loading={loadingAlertas}
        />
        <KpiCard
          label="Notícias urgentes (24h)"
          value={noticiasUrgentes}
          accentColor={noticiasUrgentes > 0 ? 'red' : 'green'}
          loading={loadingNoticias}
        />
      </div>

      {/* KPIs Pro (se tiver acesso) */}
      {isPro && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Focos de calor (24h)"
            value={focosHoje}
            accentColor={focosHoje > 10 ? 'red' : focosHoje > 0 ? 'yellow' : 'green'}
            loading={loadingFires}
          />
          <KpiCard
            label="Municípios dengue alerta"
            value={municipiosDengueAlerta}
            accentColor={municipiosDengueAlerta > 10 ? 'red' : municipiosDengueAlerta > 0 ? 'yellow' : 'green'}
            loading={loadingDengue}
          />
          <KpiCard
            label="Estações INMET"
            value={estacoes?.length ?? '—'}
            accentColor="blue"
            loading={loadingClima}
          />
          <KpiCard
            label="Municípios PR"
            value="399"
            accentColor="blue"
          />
        </div>
      )}

      <p className="text-text-muted text-sm">
        Use o menu lateral para navegar pelos módulos de inteligência.
      </p>
    </div>
  )
}
