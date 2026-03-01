# Configuracao do Stripe

## 1. Criar Price IDs no Stripe Dashboard

1. Acesse https://dashboard.stripe.com/products
2. Crie um produto "C2 Parana Solo" com preco R$ 49,00/mes (BRL, recurring)
3. Crie um produto "C2 Parana Pro" com preco R$ 149,00/mes (BRL, recurring)
4. Copie os Price IDs (comecam com `price_`)

## 2. Configurar Secrets no Supabase

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set STRIPE_PRICE_SOLO=price_xxx
supabase secrets set STRIPE_PRICE_PRO=price_xxx
```

## 3. Configurar Webhook no Stripe

1. Acesse https://dashboard.stripe.com/webhooks
2. Adicione endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Selecione eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copie o Webhook Secret e configure como `STRIPE_WEBHOOK_SECRET`

## 4. Testar (modo test)

Use as chaves `sk_test_` e `price_test_` do Stripe para testes.

Cartao de teste: `4242 4242 4242 4242`, qualquer data futura, qualquer CVC.

## 5. Variaveis de Ambiente Necessarias

### Supabase Edge Functions

| Variavel | Descricao |
|----------|-----------|
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe (sk_live_* ou sk_test_*) |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook (whsec_*) |
| `STRIPE_PRICE_SOLO` | Price ID do plano Solo (price_*) |
| `STRIPE_PRICE_PRO` | Price ID do plano Pro (price_*) |

### Frontend (opcional)

| Variavel | Descricao |
|----------|-----------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave publica do Stripe (pk_live_* ou pk_test_*) |

## 6. Fluxo de Checkout

1. Usuario clica em "Assinar" no frontend
2. Frontend chama Edge Function `create-checkout`
3. Edge Function cria sessao Stripe Checkout
4. Usuario e redirecionado para Stripe
5. Apos pagamento, Stripe envia webhook para `stripe-webhook`
6. Edge Function atualiza `subscriptions` no Supabase
7. Usuario e redirecionado para `/checkout/success`

## 7. Troubleshooting

### Erro "Stripe price ID nao configurado"

Verifique se `STRIPE_PRICE_SOLO` e `STRIPE_PRICE_PRO` estao configurados:

```bash
supabase secrets list
```

### Webhook nao esta funcionando

1. Verifique se o endpoint esta correto no Stripe Dashboard
2. Verifique se `STRIPE_WEBHOOK_SECRET` esta correto
3. Verifique os logs da Edge Function:

```bash
supabase functions logs stripe-webhook
```

### Subscription nao atualiza apos pagamento

1. Verifique se o webhook `checkout.session.completed` esta configurado
2. Verifique os logs para erros de banco de dados
3. Confirme que o `user_id` no metadata esta correto
