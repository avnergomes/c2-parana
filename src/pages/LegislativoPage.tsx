// src/pages/LegislativoPage.tsx
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'

export function LegislativoPage() {
  const { isPro } = useAuth()

  if (!isPro) {
    return (
      <div className="p-6">
        <PaywallModal feature="Legislativo" requiredPlan="pro" onClose={() => history.back()} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Legislativo</h1>
        <p className="text-text-secondary text-sm mt-1">
          Assembleia Legislativa do Paraná — projetos de lei, sessões e votações
        </p>
      </div>
      <ErrorBoundary moduleName="legislativo">
        <AlepFeed />
      </ErrorBoundary>
    </div>
  )
}
