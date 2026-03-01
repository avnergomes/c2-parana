// src/pages/CheckoutCancel.tsx
import { useNavigate } from 'react-router-dom'

export function CheckoutCancelPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-10 max-w-md text-center">
        <h2 className="text-xl font-bold text-text-primary mb-2">Checkout cancelado</h2>
        <p className="text-text-secondary text-sm mb-6">Você cancelou o processo de assinatura. Pode tentar novamente quando quiser.</p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/dashboard')} className="btn-secondary flex-1">Voltar ao dashboard</button>
          <button onClick={() => navigate('/pricing')} className="btn-primary flex-1">Ver planos</button>
        </div>
      </div>
    </div>
  )
}
