// src/components/layout/MobileWarning.tsx
import { useState } from 'react'

export function MobileWarning() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center p-6 md:hidden">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🖥️</div>
        <h2 className="text-xl font-bold text-text-primary font-mono">C2 Paraná</h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          Esta plataforma foi projetada para uso em desktop (mínimo 1280px).
          Para a melhor experiência de inteligência territorial, acesse em um computador.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="btn-secondary text-sm px-4 py-2"
        >
          Continuar assim mesmo
        </button>
      </div>
    </div>
  )
}
