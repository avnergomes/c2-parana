// src/components/ui/PaywallModal.tsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface PaywallModalProps {
  feature: string
  requiredPlan?: 'pro' | 'enterprise'
  onClose: () => void
}

export function PaywallModal({ feature, requiredPlan = 'pro', onClose }: PaywallModalProps) {
  const navigate = useNavigate()
  const { accessStatus } = useAuth()

  const isExpired = accessStatus === 'expired' || accessStatus === 'canceled'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-8 text-center animate-fade-in">
        <div className="w-14 h-14 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-text-primary mb-2">
          {isExpired ? 'Trial expirado' : `Plano ${requiredPlan === 'pro' ? 'Pro' : 'Enterprise'} necessário`}
        </h3>
        <p className="text-text-secondary text-sm mb-6">
          {isExpired
            ? 'Seu período de trial terminou. Assine para continuar acessando o C2 Paraná.'
            : `O módulo "${feature}" está disponível no plano Pro ou superior.`}
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Fechar</button>
          <button onClick={() => navigate('/pricing')} className="btn-primary flex-1">
            {isExpired ? 'Escolher plano' : 'Fazer upgrade'}
          </button>
        </div>
      </div>
    </div>
  )
}
