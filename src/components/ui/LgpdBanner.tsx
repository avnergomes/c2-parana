// src/components/ui/LgpdBanner.tsx
import { useState } from 'react'

export function LgpdBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('lgpd-consent') === 'true'
  })

  if (dismissed) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background-elevated border-t border-border p-4 z-40">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <p className="text-text-secondary text-sm">
          Este site utiliza cookies para autenticação e análise de uso.{' '}
          <a href="#" className="text-accent-blue hover:underline">Política de Privacidade</a>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('lgpd-consent', 'true')
            setDismissed(true)
          }}
          className="btn-primary text-sm px-4 py-1.5 flex-shrink-0"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
