// src/pages/PricingPage.tsx
import { useLocation } from 'react-router-dom'
import { useCheckout } from '@/hooks/useCheckout'

const PLANS = [
  {
    id: 'solo' as const,
    name: 'Solo',
    price: 49,
    description: 'Para profissionais individuais',
    features: [
      'Mapa central básico',
      'Módulo Clima completo',
      'Feed de Notícias',
      'Alertas INMET',
      'Atualizações em tempo real',
    ],
    unavailable: ['Agronegócio', 'Saúde', 'Meio Ambiente', 'Acesso à API'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 149,
    description: 'Para equipes e empresas',
    highlight: true,
    features: [
      'Tudo do Solo',
      'Agronegócio completo (VBP, Preços, ComexStat)',
      'Saúde (InfoDengue, leitos)',
      'Meio Ambiente (FIRMS, ANA, AQICN)',
      'Legislativo (ALEP)',
      'Alertas push por e-mail',
      'Acesso à API (em breve)',
    ],
    unavailable: [],
  },
]

export function PricingPage() {
  const { startCheckout, loading: checkoutLoading, error: checkoutError } = useCheckout()
  const location = useLocation()
  const isExpired = (location.state as { expired?: boolean })?.expired

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-text-primary mb-3">Planos C2 Paraná</h1>
          {isExpired && (
            <div className="inline-block bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2 mb-4">
              <p className="text-status-warning text-sm">Seu trial de 14 dias expirou. Escolha um plano para continuar.</p>
            </div>
          )}
          <p className="text-text-secondary">Acesse inteligência territorial do Paraná em tempo real</p>
        </div>

        {checkoutError && (
          <div className="card p-4 border border-status-danger/50 text-status-danger text-sm mb-6 max-w-3xl mx-auto">
            {checkoutError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {PLANS.map(plan => (
            <div key={plan.id} className={`card p-6 flex flex-col ${plan.highlight ? 'border-accent-green shadow-glow' : ''}`}>
              {plan.highlight && (
                <span className="badge-success self-start mb-3">Mais popular</span>
              )}
              <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
              <p className="text-text-secondary text-sm mt-1">{plan.description}</p>
              <div className="mt-4 mb-6">
                <span className="text-4xl font-bold font-mono text-text-primary">R${plan.price}</span>
                <span className="text-text-secondary">/mês</span>
              </div>

              <ul className="space-y-2 flex-grow">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                    <span className="text-accent-green">✓</span> {f}
                  </li>
                ))}
                {plan.unavailable.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="text-text-muted">✗</span> {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startCheckout(plan.id)}
                disabled={checkoutLoading}
                className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}
              >
                {checkoutLoading ? 'Aguarde...' : `Assinar ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 text-text-muted text-sm">
          <p>Enterprise com dados customizados e SLA?{' '}
            <a href="mailto:contato@ccparana.com.br" className="text-accent-blue hover:underline">Fale conosco</a>
          </p>
        </div>
      </div>
    </div>
  )
}
