// src/pages/NoticiasPage.tsx
import { useState } from 'react'
import { NoticiasFeed } from '@/components/noticias/NoticiasFeed'
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { KpiCard } from '@/components/ui/KpiCard'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { useNoticiasStats } from '@/hooks/useNoticias'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

type Tab = 'feed' | 'alep'

export function NoticiasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const { data: stats } = useNoticiasStats()

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Notícias & Legislativo</h1>
          <p className="text-text-secondary text-sm mt-1">RSS · ALEP · Atualização a cada 15 minutos</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs 24h */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Notícias (24h)" value={stats?.total ?? '—'} accentColor="blue" />
        <KpiCard label="Urgentes (24h)" value={stats?.urgentes ?? 0} accentColor={stats?.urgentes ? 'red' : 'green'} />
        <KpiCard label="Importantes (24h)" value={stats?.importantes ?? 0} accentColor="yellow" />
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {[
            { id: 'feed', label: 'Feed de Notícias' },
            { id: 'alep', label: 'Legislativo (ALEP)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
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

      {/* Conteúdo */}
      <ErrorBoundary moduleName={activeTab}>
        {activeTab === 'feed' && <NoticiasFeed />}
        {activeTab === 'alep' && <AlepFeed />}
      </ErrorBoundary>
    </div>
  )
}
