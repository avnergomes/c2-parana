// src/pages/LegislativoPage.tsx
// Redirecionar para NoticiasPage tab ALEP ou mostrar conteúdo dedicado
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function LegislativoPage() {
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
