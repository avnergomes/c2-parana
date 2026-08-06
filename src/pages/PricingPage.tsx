// src/pages/PricingPage.tsx
import { Link, useLocation } from 'react-router-dom'
import { useCheckout } from '@/hooks/useCheckout'
import { useAuth } from '@/contexts/AuthContext'

type PlanId = 'starter' | 'pro'

interface Plan {
  id: PlanId
  name: string
  price: number
  description: string
  apiQuota: string
  features: string[]
  highlight?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    description: 'Para times pequenos e POCs',
    apiQuota: '10.000 chamadas/mês',
    features: [
      'Console web completo (mapa, alertas, dashboards)',
      'API REST com 1 chave',
      'Camadas: clima, queimadas, dengue, água, IRTC',
      'Alertas por e-mail (até 5 regras)',
      'Suporte por e-mail (SLA útil)',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 399,
    description: 'Para produtos em produção',
    apiQuota: '100.000 chamadas/mês',
    highlight: true,
    features: [
      'Tudo do Starter',
      'API REST com 5 chaves (rotação)',
      'Webhooks de alertas em tempo real',
      'Camadas completas (+ agro VBP, ALEP, CEMADEN, DataSUS)',
      'Export CSV/GeoJSON sob demanda',
      'Histórico estendido (24 meses)',
      'Suporte prioritário',
    ],
  },
]

export function PricingPage() {
  const { startCheckout, loading: checkoutLoading, error: checkoutError } = useCheckout()
  const { user, subscription } = useAuth()
  const location = useLocation()
  const isExpired = (location.state as { expired?: boolean })?.expired

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-3">
            Inteligência territorial do Paraná, como serviço
          </h1>
          <p className="text-text-secondary max-w-2xl mx-auto">
            API REST + console web com dados consolidados de clima, agronegócio, saúde,
            ambiente, água, queimadas e IRTC dos 399 municípios. Free tier para testar,
            planos pagos quando precisar escalar.
          </p>
          {isExpired && (
            <div className="inline-block bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2 mt-6">
              <p className="text-status-warning text-sm">
                Seu trial de 14 dias expirou. Escolha um plano para continuar.
              </p>
            </div>
          )}
        </div>

        {checkoutError && (
          <div className="card p-4 border border-status-danger/50 text-status-danger text-sm mb-6 max-w-3xl mx-auto">
            {checkoutError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Free / Trial */}
          <div className="card p-6 flex flex-col">
            <span className="badge-info self-start mb-3">Grátis</span>
            <h3 className="text-xl font-bold text-text-primary">Free</h3>
            <p className="text-text-secondary text-sm mt-1">Para conhecer o produto</p>
            <div className="mt-4 mb-6">
              <span className="text-4xl font-bold font-mono text-text-primary">R$0</span>
              <span className="text-text-secondary">/mês</span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              <strong className="text-text-primary">1.000 chamadas/mês</strong> na API pública
            </p>
            <ul className="space-y-2 flex-grow text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-accent-green">✓</span> Mapa central + camadas básicas</li>
              <li className="flex gap-2"><span className="text-accent-green">✓</span> Clima, notícias e queimadas</li>
              <li className="flex gap-2"><span className="text-accent-green">✓</span> 1 chave de API</li>
              <li className="flex gap-2"><span className="text-text-muted">✗</span> Sem webhooks ou export</li>
            </ul>
            <Link to={user ? '/dashboard' : '/register'} className="mt-6 w-full btn-secondary text-center">
              {user ? 'Ir para o console' : 'Criar conta'}
            </Link>
          </div>

          {/* Planos pagos */}
          {PLANS.map(plan => (
            <div key={plan.id} className={`card p-6 flex flex-col ${plan.highlight ? 'border-accent-green shadow-glow' : ''}`}>
              {plan.highlight && (
                <span className="badge-success self-start mb-3">Mais popular</span>
              )}
              <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
              <p className="text-text-secondary text-sm mt-1">{plan.description}</p>
              <div className="mt-4 mb-2">
                <span className="text-4xl font-bold font-mono text-text-primary">R${plan.price}</span>
                <span className="text-text-secondary">/mês</span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                <strong className="text-text-primary">{plan.apiQuota}</strong> na API
              </p>
              <ul className="space-y-2 flex-grow text-sm text-text-secondary">
                {plan.features.map(f => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent-green">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startCheckout(plan.id)}
                disabled={checkoutLoading || subscription?.plan === plan.id}
                className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}
              >
                {checkoutLoading ? 'Aguarde...' :
                  subscription?.plan === plan.id ? 'Plano atual' : `Assinar ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise */}
        <div className="mt-10 card p-6 border-accent-blue/40">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Enterprise</h3>
              <p className="text-text-secondary text-sm mt-1 max-w-2xl">
                Volume acima de 1M chamadas/mês, SLA contratual, suporte dedicado, SSO,
                dados sob demanda, integração com SISDEC ou ERP/CRM. Faturado por contrato.
              </p>
            </div>
            <a href="mailto:contato@datageoparana.com.br" className="btn-primary whitespace-nowrap">
              Falar com vendas
            </a>
          </div>
        </div>

        <p className="text-center mt-10 text-text-muted text-xs">
          Preços em BRL. Cobrança mensal via Stripe. Cancele quando quiser pelo portal de assinatura.
          Ao assinar você concorda com os{' '}
          <Link to="/legal/termos" className="text-accent-blue hover:underline">Termos de Uso</Link>{' '}
          e a{' '}
          <Link to="/legal/privacidade" className="text-accent-blue hover:underline">Política de Privacidade</Link>.
        </p>
      </div>
    </div>
  )
}
