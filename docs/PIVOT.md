# Pivô estratégico: de C4ISR para DataGeo PR

**Data da decisão:** 2026-05-19
**Status:** EM EXECUÇÃO (P0 de plumbing concluído nesta data)

## TL;DR

O produto começou como SaaS de 15 páginas (mar/2026), foi expandido para "C4ISR"
(comando e controle militar) (mar–abr/2026) e nunca encontrou comprador. Em 19/05/2026
decidimos repositionar como **DataGeo PR — API REST + Console enxuto de inteligência
territorial**, mantendo 100% dos ETLs e da base Supabase já em produção.

## Por que mudar

Sete problemas conceituais bloqueavam o lançamento como SaaS:

1. **Posicionamento conflitante.** "C4ISR" é linguagem de procurement militar
   (R$ 100k+/ano via licitação), incompatível com tier self-serve a R$49–149/mês.
2. **Funil quebrado.** Referer gate no `index.html` redirecionava qualquer visita
   direta para `datageoparana.github.io` — quebrava SEO, ads, links de marketing
   e o próprio `return_url` do Stripe Checkout.
3. **Stripe nunca verificado em produção.** CORS hardcoded para domínio inexistente
   (`c2parana.com.br`), edge functions com deploy não confirmado, sem `src/lib/stripe.ts`
   singleton.
4. **LGPD em risco.** Tracking sem consentimento em `index.html` enviando UA/timezone/UTM
   para Google Apps Script. Sem Termos de Uso nem Política de Privacidade.
5. **Escopo inflado para um produto sem cliente.** 26 páginas / 75 componentes /
   21 ETLs / 28 migrations para zero MRR.
6. **Economia operacional negativa.** ~2.979 GH Actions execs/mês contra 2.000 do
   free tier; CSV de 60MB no repo.
7. **Dados sintéticos sem flag.** `vbp_total_brl: 152_000_000_000` hardcoded
   exibido como dado real — risco regulatório.

## A nova proposta

**DataGeo PR — Inteligência territorial do Paraná como serviço.**

Reembala os mesmos ETLs (clima INMET, agro SIDRA, dengue InfoDengue, FIRMS, ANA,
IRTC, CEMADEN, DataSUS, ALEP, notícias, aviação, marítimo) como:

1. **API REST com chaves** — *o produto*. Endpoints REST simples, autenticação
   `Bearer <api_key>`, cota por plano, webhooks no Pro+. Persona: agtech,
   seguradoras, logística, ESG, defesa civil municipal, pesquisa acadêmica.
2. **Console web reduzido** — *o demo conversor*. 5 páginas no caminho do dinheiro:
   Dashboard, Mapa, Alertas, Chaves de API, Faturamento. As outras 20 páginas atuais
   ficam como "demos verticais" — preservadas no código mas fora do roadmap de
   manutenção até haver demanda.
3. **Marketing site** em `datageoparana.com.br` (separado do app em
   `app.datageoparana.com.br`) — landing + docs da API + pricing público.

## Pricing

| Plano | Preço | Cota API | Persona |
|---|---|---|---|
| Free | R$0 | 1.000 chamadas/mês | Avaliação, POCs |
| Starter | R$99/mês | 10.000 | Times pequenos, MVPs |
| Pro | R$399/mês | 100.000 + webhooks | Produtos em produção |
| Enterprise | sob contrato | > 1M + SLA + SSO | Corporativo / governo |

## P0 — concluído em 19/05/2026

Diff aplicado nesta sessão:

| # | Mudança | Arquivo |
|---|---|---|
| 1 | Remover referer gate + tracking não-consentido | `index.html` |
| 2 | CORS multi-origem via `CORS_ORIGINS` (csv) | `supabase/functions/{create-checkout,create-portal,stripe-webhook}/index.ts` |
| 3 | Criar singleton `getStripe()` | `src/lib/stripe.ts` (novo) |
| 4 | Repositionar PricingPage (Free + Starter + Pro + Enterprise) | `src/pages/PricingPage.tsx` |
| 5 | Renomear `solo` → `starter` em hook + edge function (mantém alias) | `src/hooks/useCheckout.ts`, `create-checkout/index.ts`, `src/types/index.ts` |
| 6 | Criar páginas legais ToS + PP (LGPD) | `src/pages/TermsPage.tsx`, `PrivacyPage.tsx` (novos) |
| 7 | Rotear `/legal/termos` e `/legal/privacidade` | `src/router/index.tsx` |
| 8 | Link real em "Termos de Uso" no Register | `src/pages/Register.tsx` |
| 9 | Flag `is_fallback` em VBP sintético | `scripts/etl_agro.py` |
| 10 | README real positionando o produto | `README.md` |
| 11 | Documento de pivô (este arquivo) | `docs/PIVOT.md` |

## P1 — próximo (depende do usuário)

Itens que precisam de ação manual (Chrome/Stripe/Supabase Dashboards):

1. **Criar produtos no Stripe**: 2 produtos (`Starter`, `Pro`) → 2 prices em BRL
   recorrentes mensais. Copiar os `price_xxx` IDs.
2. **Configurar secrets no Supabase Dashboard → Edge Functions → Secrets**:
   - `STRIPE_SECRET_KEY` (sk_live_… ou sk_test_…)
   - `STRIPE_WEBHOOK_SECRET` (whsec_… após criar o webhook)
   - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`
   - `CORS_ORIGINS` = `"https://app.datageoparana.com.br,http://localhost:5173"`
3. **Deploy das edge functions**:
   ```
   supabase functions deploy create-checkout
   supabase functions deploy create-portal
   supabase functions deploy stripe-webhook
   supabase functions deploy public-api
   ```
4. **Webhook no Stripe Dashboard** apontando para
   `https://<ref>.supabase.co/functions/v1/stripe-webhook` com eventos:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
5. **Hospedar app em domínio próprio** (`app.datageoparana.com.br` via Vercel
   ou Cloudflare Pages) — sai do GitHub Pages e abandona o referer gate.
6. **Aplicar migration 033** (`api_keys` + `api_usage`) via `supabase db push`.
7. **Remover CSV de 60MB do tracking git**:
   `git rm --cached data/idr-getec-raw/all_clients.csv && git commit -m "chore: untrack large CSV"`
   (já está no `.gitignore`; precisa remover do índice).

## P2 — backlog estratégico

- Consolidar 26 → ~10 páginas mantidas (alvo H2 2026).
- Migrar ETLs Python restantes para Edge Functions + pg_cron (resolve P0 da
  economia de GH Actions).
- Documentação OpenAPI 3 da API pública.
- SDKs cliente (Python + JS) auto-gerados a partir do OpenAPI.
- gov.br SSO para Enterprise.
- Sentinel/Copernicus (camada satélite) — €50/mês quando houver receita
  cobrindo.

## Anti-drift

Mesma regra do `STATUS.md`: um plano ativo só. Este documento é o **mapa de
posicionamento**. O `STATUS.md` continua sendo o status operacional por fase.
Qualquer nova grande decisão estratégica vira atualização aqui — não novo arquivo.
