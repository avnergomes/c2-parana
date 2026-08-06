# DataGeo PR

> **API REST + Console web de inteligência territorial dos 399 municípios do Paraná.**
> Clima (INMET), agronegócio (SIDRA/IBGE), saúde (InfoDengue + DataSUS), meio ambiente
> (NASA FIRMS + AQICN + CEMADEN), água (ANA + InfoHidro), legislativo (ALEP), notícias
> (RSS curado), aviação e marítimo — atualizados via Edge Functions + pg_cron.

Repositório legado conhecido como `c2-parana` (pivô C4ISR encerrado). Veja
[`STATUS.md`](./STATUS.md) para o histórico e [`docs/PIVOT.md`](./docs/PIVOT.md)
para a posição estratégica atual.

---

## Por que existe

Dados ambientais e socioeconômicos do Paraná moram em ~15 portais públicos diferentes,
cada um com seu formato, cadência e instabilidade. Quem precisa integrar (agtech,
seguradoras, logística, ESG, defesa civil municipal, pesquisa) acaba reescrevendo o
mesmo ETL. O DataGeo PR consolida, normaliza e expõe esses dados como:

- **API REST** com chaves, cota por plano e webhooks
- **Console web** com mapa, alertas e dashboards prontos
- **Export** CSV/GeoJSON e snapshots históricos

## Stack

| Camada | Tecnologia |
|---|---|
| Front | React 18 + Vite + TypeScript + Tailwind + Leaflet + Recharts |
| Auth/BD | Supabase (Postgres + RLS + Realtime + Auth) |
| ETLs | Python 3.11 (legado, em migração) → Supabase Edge Functions (Deno) |
| Cron | pg_cron no Supabase (substitui GitHub Actions) |
| Pagamentos | Stripe (Checkout + Customer Portal + Webhook) |
| Hospedagem do app | Vercel ou Cloudflare Pages em `app.datageoparana.com.br` (alvo) |
| Hospedagem atual | GitHub Pages (`avnergomes.github.io/c2-parana/`) — em migração |
| Observabilidade | Sentry (upgrade para v8 pendente) |

## Estrutura

```
src/                React app (console)
  pages/            26 páginas — em consolidação para ~10 (ver PIVOT.md)
  components/       75 componentes
  hooks/            33 hooks
  contexts/         AuthContext, MapDataContext
  lib/              supabase.ts, stripe.ts, sentry.ts, utils.ts
  router/           AppRouter + ProtectedRoute

supabase/
  migrations/       33 migrations (numeradas)
  functions/        Edge Functions:
                      create-checkout, create-portal, stripe-webhook
                      etl-aviacao, etl-clima, etl-maritimo, scrape-infohidro
                      public-api  (nova — superfície SaaS)

scripts/            21 ETLs Python (legado, em migração p/ Edge Functions)
.github/workflows/  23 workflows (legado, sendo descomissionados conforme ETLs migram)
docs/               PIVOT.md, SETUP_STRIPE.md, archive/
```

## Setup local

```bash
# 1. Deps
npm install
pip install -r scripts/requirements.txt   # opcional, só para rodar ETLs Python

# 2. Variáveis
cp .env.example .env.local
# preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STRIPE_PUBLISHABLE_KEY

# 3. Dev
npm run dev              # Vite em http://localhost:5173
npm run type-check       # tsc --noEmit
npm run test:unit        # vitest
npm test                 # playwright e2e (precisa do dev server up)
```

## Setup do backend Supabase

```bash
supabase link --project-ref <ref>
supabase db push                  # aplica migrations/
supabase functions deploy public-api
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy stripe-webhook

# Secrets (configure em Supabase Dashboard → Edge Functions → Secrets):
#   STRIPE_SECRET_KEY
#   STRIPE_WEBHOOK_SECRET
#   STRIPE_PRICE_STARTER    (price_xxx do plano Starter R$99)
#   STRIPE_PRICE_PRO        (price_xxx do plano Pro R$399)
#   CORS_ORIGINS            "https://app.datageoparana.com.br,http://localhost:5173"
```

Detalhes passo-a-passo em [`docs/SETUP_STRIPE.md`](./docs/SETUP_STRIPE.md).

## API pública (em construção)

Endpoint base: `https://<projeto>.supabase.co/functions/v1/public-api/`

Autenticação por header `Authorization: Bearer <api_key>` (chaves geradas no console em
`/configuracoes/api`). Cota por plano:

| Plano | Chamadas/mês | Webhooks | Export |
|---|---|---|---|
| Free | 1.000 | — | — |
| Starter (R$99/mês) | 10.000 | — | manual |
| Pro (R$399/mês) | 100.000 | sim | CSV/GeoJSON |
| Enterprise | sob contrato | sim | full + SLA |

Recursos previstos (v1):
- `GET /v1/clima/atual?ibge=4106902`
- `GET /v1/queimadas?bbox=...&from=...&to=...`
- `GET /v1/dengue/municipio/{ibge}/semana/{yyyyww}`
- `GET /v1/irtc/{ibge}`
- `GET /v1/alertas?ativas=true`
- `POST /v1/webhooks` (Pro+)

## Posicionamento

| | Antes (c2-parana) | Agora (DataGeo PR) |
|---|---|---|
| Persona | "Defesa Civil / Comando" | Agtech, seguradoras, logística, ESG, defesa civil municipal |
| Modelo | 26 telas dashboard puro | API-first + console enxuto |
| Preço | R$49/149 sem mercado | Free + R$99 + R$399 + Enterprise |
| Hospedagem | GitHub Pages + referer gate | Vercel em domínio próprio |
| Compliance | Sem ToS/PP, tracking sem consent | ToS + PP + LGPD opt-in |

Veja [`docs/PIVOT.md`](./docs/PIVOT.md) para o racional completo.

## Status

`STATUS.md` é o **único documento ativo** de progresso. Não criar novos `PLANO_*.md`
na raiz — atualizar `STATUS.md` ao fechar cada fase.

## Contato

`contato@datageoparana.com.br` · Curitiba/PR · Brasil
