# 13 — STRIPE PLANS: Pagamentos, Planos e Webhooks

## Descrição
Configura os produtos e preços no Stripe Dashboard, finaliza as Edge Functions de checkout e webhook já criadas no prompt 02, implementa o Customer Portal e testa o fluxo completo com o Stripe CLI.

## Pré-requisitos
- Prompt 02 concluído (Edge Functions criadas)
- Prompt 03 concluído (PricingPage implementada)
- Conta Stripe criada em stripe.com
- Stripe CLI instalado localmente para testes

## Variáveis de Ambiente
```bash
# .env.local
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Supabase Edge Function secrets (via supabase secrets set)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  (gerado pelo Stripe CLI ou Dashboard)
STRIPE_PRICE_SOLO=price_...      (criado no Dashboard)
STRIPE_PRICE_PRO=price_...       (criado no Dashboard)
```

---

## Prompt para o Claude Code

```
Vou configurar o Stripe completo para o C2 Paraná: produtos, preços, webhooks e customer portal. Execute todos os passos.

## PASSO 1: Criar produtos e preços no Stripe Dashboard

No Stripe Dashboard (dashboard.stripe.com):

1. **Criar produto Solo**:
   - Products → Add product
   - Name: "C2 Paraná Solo"
   - Description: "Acesso ao mapa, clima e notícias do Paraná"
   - Pricing: R$ 49,00/mês (recorrente)
   - Currency: BRL
   - Interval: Monthly
   - Copiar o Price ID gerado (price_xxx) → será STRIPE_PRICE_SOLO

2. **Criar produto Pro**:
   - Products → Add product
   - Name: "C2 Paraná Pro"
   - Description: "Acesso completo: agro, saúde, ambiente, legislativo"
   - Pricing: R$ 149,00/mês (recorrente)
   - Currency: BRL
   - Interval: Monthly
   - Copiar o Price ID → será STRIPE_PRICE_PRO

3. **Configurar Customer Portal**:
   - Settings → Billing → Customer portal → Configure
   - Ativar: "Allow customers to cancel subscriptions"
   - Ativar: "Allow customers to update payment methods"
   - Ativar: "Allow customers to view their billing history"
   - Salvar configuração

## PASSO 2: Configurar secrets da Edge Function

Execute no terminal:
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_SOLO=price_...
supabase secrets set STRIPE_PRICE_PRO=price_...

(o STRIPE_WEBHOOK_SECRET será configurado no passo 4)

## PASSO 3: Adicionar Customer Portal à Edge Function create-checkout

Adicionar endpoint de portal ao create-checkout/index.ts.
Crie supabase/functions/create-portal/index.ts:

```typescript
// supabase/functions/create-portal/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.15.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (!subscription?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'No active subscription' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    })

    const { return_url } = await req.json().catch(() => ({}))

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: return_url || `${req.headers.get('origin')}/dashboard`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

Deploy:
supabase functions deploy create-portal

## PASSO 4: Configurar Webhook no Stripe Dashboard

**Para desenvolvimento local (com Stripe CLI)**:

Instalar Stripe CLI:
brew install stripe/stripe-cli/stripe  # macOS
# ou: https://stripe.com/docs/stripe-cli

Login:
stripe login

Fazer forward de webhooks para a Edge Function local:
supabase start  # iniciar Supabase local
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook

Copiar o webhook signing secret (whsec_...) que aparece no terminal →
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

**Para produção (Stripe Dashboard)**:

1. Stripe Dashboard → Webhooks → Add endpoint
2. Endpoint URL: `https://[projeto].supabase.co/functions/v1/stripe-webhook`
3. Events to listen:
   - checkout.session.completed
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_failed
4. Copiar Signing secret → supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

## PASSO 5: Criar src/hooks/useCheckout.ts

```typescript
// src/hooks/useCheckout.ts
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { callEdgeFunction } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

export function useCheckout() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  const startCheckout = async (plan: 'solo' | 'pro') => {
    if (!user) {
      navigate('/login')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { url } = await callEdgeFunction<{ url: string }>('create-checkout', {
        plan,
        success_url: `${window.location.origin}/checkout/success`,
        cancel_url: `${window.location.origin}/pricing`,
      })

      if (url) {
        window.location.href = url
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar checkout')
      console.error('Checkout error:', err)
    } finally {
      setLoading(false)
    }
  }

  const openPortal = async () => {
    setLoading(true)
    setError(null)

    try {
      const { url } = await callEdgeFunction<{ url: string }>('create-portal', {
        return_url: window.location.href,
      })

      if (url) {
        window.open(url, '_blank')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao abrir portal')
    } finally {
      setLoading(false)
    }
  }

  return { startCheckout, openPortal, loading, error }
}
```

## PASSO 6: Adicionar botão de Portal no Header/Menu

No componente Header.tsx, adicionar opção "Gerenciar assinatura" no dropdown do usuário:

```typescript
// Adicionar ao Header.tsx — dentro do dropdown do usuário

import { useCheckout } from '@/hooks/useCheckout'

// No componente:
const { openPortal, loading: portalLoading } = useCheckout()

// No menu dropdown:
{subscription?.stripe_subscription_id && (
  <button
    onClick={() => { openPortal(); setMenuOpen(false) }}
    disabled={portalLoading}
    className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-background-elevated hover:text-text-primary transition-colors"
  >
    {portalLoading ? 'Carregando...' : 'Gerenciar assinatura'}
  </button>
)}
```

## PASSO 7: Atualizar PricingPage para usar useCheckout

Substituir o fetch manual no PricingPage.tsx pelo hook:

```typescript
// src/pages/PricingPage.tsx — versão atualizada com hook
import { useCheckout } from '@/hooks/useCheckout'

// No componente:
const { startCheckout, loading: checkoutLoading, error: checkoutError } = useCheckout()

// Substituir handleCheckout por:
const handleCheckout = (planId: string) => {
  startCheckout(planId as 'solo' | 'pro')
}

// Mostrar erro se ocorrer:
{checkoutError && (
  <div className="card p-4 border border-status-danger/50 text-status-danger text-sm">
    {checkoutError}
  </div>
)}
```

## PASSO 8: Teste com Stripe CLI

**Testar checkout completo**:

1. Iniciar dev server: `npm run dev`
2. Em outro terminal, fazer forward de webhooks:
   `stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook`
3. Acessar `/pricing` → clicar "Assinar Pro"
4. No checkout Stripe, usar cartão de teste: `4242 4242 4242 4242`
   - Data: qualquer futura (ex: 12/28)
   - CVC: qualquer 3 dígitos (ex: 123)
5. Verificar no Supabase que `subscriptions.status` mudou para `active`

**Testar cancelamento**:
`stripe trigger customer.subscription.deleted`

**Testar pagamento falho**:
`stripe trigger invoice.payment_failed`

**Cartões de teste úteis**:
- `4242 4242 4242 4242` — pagamento aprovado
- `4000 0000 0000 0002` — pagamento recusado
- `4000 0025 0000 3155` — requer autenticação 3D Secure

## PASSO 9: Migrar para produção

Quando pronto para produção:

1. Ativar conta Stripe (preencher dados bancários)
2. Criar produtos e preços no modo LIVE do Stripe Dashboard
3. Atualizar secrets:
   - `VITE_STRIPE_PUBLISHABLE_KEY` → pk_live_...
   - Edge Function: `STRIPE_SECRET_KEY` → sk_live_...
   - Edge Function: `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO` → IDs do modo live
   - Novo webhook para produção → novo `STRIPE_WEBHOOK_SECRET`
4. Verificar que o webhook endpoint aponta para a URL de produção do Supabase
```

---

## Arquivos Criados/Modificados

```
supabase/functions/
└── create-portal/
    └── index.ts                          (CRIADO)
src/
├── hooks/useCheckout.ts                  (CRIADO)
└── pages/PricingPage.tsx                 (ATUALIZADO — usa useCheckout)
src/components/layout/Header.tsx          (ATUALIZADO — link para portal)
```

---

## Verificação

1. Supabase Edge Functions deployadas: `supabase functions list` mostra `create-checkout`, `stripe-webhook`, `create-portal`
2. Webhook teste: `stripe trigger checkout.session.completed` → logs na Edge Function mostram processamento
3. Fluxo completo em modo test: login → pricing → checkout → stripe → success → subscription ativa no banco
4. Portal: menu do usuário → "Gerenciar assinatura" → abre portal Stripe em nova aba

---

## Notas Técnicas

- **BRL no Stripe**: Certifique-se de que a conta Stripe tem BRL habilitado. Por padrão, contas novas aceitam USD. Para ativar BRL: Dashboard → Settings → Account details → Business.
- **Stripe no Brasil**: Para cobrar em BRL de clientes BR, a conta Stripe precisa ser uma conta brasileira (entidade jurídica BR) ou usar Stripe Connect. Contas de outros países cobrarão IOF adicional.
- **Customer Portal vs custom**: O Customer Portal do Stripe é um iframe hospedado pelo próprio Stripe — sem PCI compliance issues. O usuário gerencia cartão, histórico e cancelamento sem nenhum código adicional.
- **Webhook reliability**: Webhooks podem falhar (timeout, servidor down). Configure retry no Stripe Dashboard. A lógica de `upsert` nas Edge Functions é idempotente — executar o mesmo evento duas vezes não duplica dados.
- **trial_end vs subscription**: Quando o usuário assina durante o trial, o banco atualiza `status` para `active` e `trial_end` fica no passado. O `accessStatus` no AuthContext reflete isso corretamente.
