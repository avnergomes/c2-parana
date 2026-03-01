// src/pages/CheckoutSuccess.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function CheckoutSuccessPage() {
  const navigate = useNavigate()
  const { refreshSubscription } = useAuth()

  useEffect(() => {
    // Primeiro refresh imediato
    refreshSubscription()

    // Segundo refresh após 2s (dá tempo pro webhook do Stripe)
    const retryTimer1 = setTimeout(() => refreshSubscription(), 2000)

    // Terceiro refresh após 4s (fallback extra)
    const retryTimer2 = setTimeout(() => refreshSubscription(), 4000)

    // Redirecionar após 6s (dá tempo para os refreshes completarem)
    const navTimer = setTimeout(() => navigate('/dashboard'), 6000)

    return () => {
      clearTimeout(retryTimer1)
      clearTimeout(retryTimer2)
      clearTimeout(navTimer)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-10 max-w-md text-center">
        <div className="w-16 h-16 bg-accent-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Assinatura ativada!</h2>
        <p className="text-text-secondary text-sm">Bem-vindo ao C2 Paraná. Redirecionando para o dashboard...</p>
      </div>
    </div>
  )
}
