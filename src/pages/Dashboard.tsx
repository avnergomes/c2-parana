// src/pages/Dashboard.tsx
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/ui/KpiCard'

export function DashboardPage() {
  const { user, subscription, accessStatus } = useAuth()
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">
          Bem-vindo ao C2 Paraná, {user?.email}
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Status" value={accessStatus === 'trialing' ? 'Trial' : subscription?.plan || '—'} accentColor="green" />
        <KpiCard label="Módulos ativos" value="7" accentColor="blue" />
        <KpiCard label="Municípios PR" value="399" accentColor="blue" />
        <KpiCard label="Atualizações/dia" value=">200" accentColor="green" />
      </div>
      <p className="text-text-muted text-sm">
        Use o menu lateral para navegar pelos módulos de inteligência.
      </p>
    </div>
  )
}
