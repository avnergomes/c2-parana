# Próxima sessão — onde paramos

**Última sessão:** 2026-05-19 → 2026-05-20
**Contexto curto:** pivô estratégico de c2-parana (C4ISR) para **DataGeo PR (API + Console SaaS)**
aplicado em código. Plumbing P0 concluído. Falta a configuração externa (Stripe + Supabase
+ deploy) que exige login em dashboards.

> Leia primeiro: [`PIVOT.md`](./PIVOT.md) (racional do pivô) e [`../STATUS.md`](../STATUS.md)
> (status geral). Este arquivo é só o "continue de onde paramos".

---

## ✅ Já entregue (commits ainda não criados — working tree)

Diff resumido — type-check verde:

| # | Arquivo | O quê |
|---|---|---|
| 1 | `index.html` | Removido referer gate (`datageoparana.github.io`) + tracking não-consentido (LGPD) |
| 2 | `supabase/functions/create-checkout/index.ts` | CORS multi-origem via `CORS_ORIGINS` + plano `starter` (alias `solo` legado) + `STRIPE_PRICE_STARTER` |
| 3 | `supabase/functions/create-portal/index.ts` | CORS multi-origem |
| 4 | `src/lib/stripe.ts` *(novo)* | Singleton `getStripe()` |
| 5 | `src/pages/PricingPage.tsx` | Reposicionado: Free + Starter R$99 + Pro R$399 + Enterprise. API-first copy |
| 6 | `src/pages/TermsPage.tsx` *(novo)* | Termos de Uso (LGPD) |
| 7 | `src/pages/PrivacyPage.tsx` *(novo)* | Política de Privacidade (LGPD) |
| 8 | `src/router/index.tsx` | Rotas `/legal/termos` e `/legal/privacidade` |
| 9 | `src/pages/Register.tsx` | Link real para ToS+PP (era `href="#"`) |
| 10 | `src/hooks/useCheckout.ts` | Tipo `'starter' \| 'pro'` |
| 11 | `src/types/index.ts` | `SubscriptionPlan` inclui `starter`; `PLAN_FEATURES.starter` adicionado |
| 12 | `scripts/etl_agro.py` | Flag `is_fallback: true` no VBP sintético R$152bi |
| 13 | `README.md` | Reescrito (era 13 bytes) |
| 14 | `docs/PIVOT.md` *(novo)* | Documento estratégico do pivô |
| 15 | `STATUS.md` | Header atualizado com a decisão de pivô |
| 16 | `supabase/migrations/033_api_keys.sql` *(novo)* | `api_keys` (hash SHA-256), `api_usage`, `plan_quotas` (free/starter/pro/enterprise), função `check_api_quota()` SECURITY DEFINER |
| 17 | `supabase/functions/public-api/index.ts` *(novo)* | Edge function da API pública — 5 endpoints v1: `/v1/health`, `/v1/clima/atual`, `/v1/queimadas`, `/v1/dengue/municipio/{ibge}`, `/v1/alertas`, `/v1/irtc/{ibge}`. Autentica via `Authorization: Bearer dgp_…`, enforça quota, loga em `api_usage` |

**Validação:** `npx tsc --noEmit` → exit 0. Nenhum teste rodado (Playwright requer dev server + ETLs requer Python env).

---

## ⏭️ Próximo passo (ordem sugerida)

### Passo 1 — Stripe (~10 min, Chrome)
- Dashboard → Products → New product:
  - "DataGeo PR — Starter" → Price: BRL 99, recorrente mensal → copiar `price_xxx`
  - "DataGeo PR — Pro" → Price: BRL 399, recorrente mensal → copiar `price_xxx`
- Dashboard → Developers → Webhooks → Add endpoint:
  - URL: `https://<SUPABASE_REF>.supabase.co/functions/v1/stripe-webhook`
  - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
  - Copiar `whsec_xxx`

### Passo 2 — Supabase Secrets (~5 min, Chrome)
Dashboard → Project Settings → Edge Functions → Secrets:
```
STRIPE_SECRET_KEY      = sk_live_… (ou sk_test_…)
STRIPE_WEBHOOK_SECRET  = whsec_…
STRIPE_PRICE_STARTER   = price_…
STRIPE_PRICE_PRO       = price_…
CORS_ORIGINS           = https://app.datageoparana.com.br,http://localhost:5173
```

### Passo 3 — Deploy (CLI, ~3 min)
```powershell
cd C:\Users\avner\onedrive\documentos\github\c2-parana
supabase link --project-ref <REF>     # se ainda não linkado
supabase db push                       # aplica migration 033
supabase functions deploy public-api
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy stripe-webhook
```

### Passo 4 — Validar smoke (~5 min)
- `GET https://<ref>.supabase.co/functions/v1/public-api/v1/health` → 200 `{success:true,data:{status:"ok"}}`
- Sem chave: `GET .../v1/clima/atual?ibge=4106902` → 401 `Missing Authorization`
- Criar chave via `INSERT INTO api_keys` manualmente para testar (ou implementar tela `/configuracoes/api` — ainda não existe, ver "P1 pendente")
- Pricing page → "Assinar Pro" → redirect Stripe Checkout funcionando

### Passo 5 — Hospedagem em domínio próprio (~30 min)
- Sair do GitHub Pages (`avnergomes.github.io/c2-parana/`).
- Conectar repo ao Vercel ou Cloudflare Pages, deploy em `app.datageoparana.com.br`.
- Atualizar `CORS_ORIGINS` para o domínio final.
- Configurar DNS (CNAME `app` → vercel/cloudflare).

### Passo 6 — Limpeza git (~1 min, destrutivo)
```powershell
git rm --cached data/idr-getec-raw/all_clients.csv
git commit -m "chore: untrack legacy 60MB CSV (already in .gitignore)"
```

---

## 🔜 P1 pendente em código (não destrava lançamento, mas fica feio sem)

- **Tela de gestão de chaves** em `/configuracoes/api` — listar `api_keys`, criar, revogar, copiar a chave UMA vez na criação. Hash SHA-256 no client antes de enviar (ou via edge function dedicada `create-api-key`). Estimativa: 1 sessão.
- **Página de uso/billing** em `/configuracoes/faturamento` — mostrar consumo do mês (`api_usage` agregado), botão "Gerenciar assinatura" abrindo `create-portal`. Estimativa: 1 sessão.
- **OpenAPI 3** para `/public-api` em `docs/openapi.yaml` — destrava SDKs e documentação. Estimativa: 30 min.
- **Sentry SDK v7 → v8** (`@sentry/react`) — STATUS.md A8.
- **Migrar cron-clima e cron-noticias para Edge Functions** — destrava o problema de ~3k execs/mês do GH Actions free tier.
- **Consolidação de páginas:** decidir quais das 26 páginas atuais permanecem no roadmap e quais viram "demo verticais" só preservadas. Alvo realista: 10 mantidas.

---

## 🧠 Decisões de design importantes (não reabrir sem motivo)

1. **`solo` é alias de `starter`.** Existem subscriptions legadas; renomear `plan='solo'` no banco hoje quebraria RLS/queries. Em vez disso, ambos têm `PLAN_FEATURES` idênticos e `create-checkout` faz `normalizedPlan = plan === 'solo' ? 'starter' : plan`. Migrar de fato só após zerar usuários `solo`.
2. **API keys: armazenamos hash SHA-256, não a chave.** Prefixo `dgp_live_XXXX…` exibido só na criação. Banco vazado ≠ chaves utilizáveis.
3. **`check_api_quota()` é SECURITY DEFINER + REVOKE ALL FROM PUBLIC.** Só `service_role` chama; a edge function `public-api` é a única consumidora.
4. **Quota é por chave, não por usuário.** `api_usage WHERE api_key_id = ... AND called_at >= date_trunc('month', NOW())`. Permite criar chaves de teste com limite implícito de "está incluso no plano".
5. **`free` tier não cria registro em `subscriptions`.** Quem assina via Stripe cria; quem registra mas nunca paga fica sem row e cai em `plan_quotas.free` (1k/mês). O trigger `on_profile_created` ainda cria `trialing/pro` por 14 dias — depois disso a row vira `expired` e `check_api_quota` força `free`.

---

## 🚫 Não fazer

- **Não criar PLANO_*.md novo na raiz.** STATUS.md é o único contrato de status; PIVOT.md é o único contrato de posicionamento; este NEXT_SESSION.md é o handoff de curto prazo. Mais que isso vira drift documental (ver STATUS §9).
- **Não desfazer o pivô SaaS sem revisitar PIVOT.md.** Os 7 problemas conceituais permanecem se voltarmos para "C4ISR self-serve".
- **Não habilitar tracking analytics sem banner de consentimento.** O script removido do `index.html` enviava UA/timezone/UTM sem opt-in — se for reintroduzir, fazer com banner + base legal documentada em PrivacyPage.

---

## 📂 Memória global complementar

Cópia desta decisão também salva em:
`C:\Users\avner\.claude\projects\C--Users-avner-onedrive-documentos-github-c2-parana\memory\project_pivot_2026_05_19.md`
(sobrevive a `rm -rf` do repo; este NEXT_SESSION.md sobrevive a wipes de `~/.claude`).
