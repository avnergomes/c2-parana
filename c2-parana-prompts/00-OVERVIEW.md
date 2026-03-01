# 00 — OVERVIEW: Command & Control Paraná (C2 PR)

> Documento mestre de arquitetura e referência para todos os prompts do projeto.

---

## Visão Geral

**C2 Paraná** (também chamado de **Paraná Monitor**) é um SaaS de inteligência territorial do estado do Paraná, inspirado no WorldMonitor.app. Consolida em um único dashboard: clima, agronegócio, saúde, meio ambiente, notícias e dados legislativos — com mapa interativo central, autenticação, paywall e atualização automática de dados via GitHub Actions.

- **Modelo de negócio**: SaaS pago, trial gratuito de 14 dias, sem plano free permanente
- **Público-alvo**: gestores públicos, jornalistas, analistas, agronegócio, consultorias
- **Planos**: Solo R$49/mês · Pro R$149/mês · Enterprise (consulta)

---

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USUÁRIO FINAL                                  │
│                    browser (desktop 1280px+)                            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GITHUB PAGES (Frontend Estático)                     │
│            https://avnergomes.github.io/c2-parana                      │
│                                                                         │
│   React 18 + Vite + TypeScript + Tailwind CSS                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│   │  Mapa    │ │  Clima   │ │  Agro    │ │  Saúde   │ │ Ambiente │   │
│   │ Leaflet  │ │  INMET   │ │ Datageo  │ │InfoDengue│ │  FIRMS   │   │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│   ┌──────────┐ ┌──────────┐                                            │
│   │ Notícias │ │Legislat. │                                            │
│   │   RSS    │ │   ALEP   │                                            │
│   └──────────┘ └──────────┘                                            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ supabase-js SDK
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE (BaaS)                                 │
│                   https://[project].supabase.co                         │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Auth           │  │  PostgreSQL DB   │  │  Edge Functions (Deno)  │ │
│  │  email/senha    │  │  profiles        │  │  create-checkout        │ │
│  │  Google OAuth   │  │  subscriptions   │  │  stripe-webhook         │ │
│  │                 │  │  data_cache      │  │  (Stripe integration)   │ │
│  └─────────────────┘  │  alerts          │  └─────────────────────────┘ │
│                        │  news_items      │                              │
│                        │  climate_data    │                              │
│                        └─────────────────┘                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  STRIPE          │ │ GITHUB ACTIONS   │ │  APIs EXTERNAS   │
│  Checkout        │ │  (Cron Jobs)     │ │                  │
│  Customer Portal │ │  Clima (30min)   │ │  INMET           │
│  Webhooks        │ │  Agro (diário)   │ │  InfoDengue      │
│                  │ │  Saúde (semanal) │ │  NASA FIRMS      │
└──────────────────┘ │  Ambiente (6h)   │ │  ANA Telemetria  │
                     │  Notícias (15min)│ │  AQICN/WAQI      │
                     │  Legisl. (diário)│ │  ALEP            │
                     └──────────────────┘ │  OpenDataSUS     │
                                          │  BCB/SIDRA       │
                                          └──────────────────┘
```

---

## Stack Tecnológico Completo

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | React | 18.x |
| Build tool | Vite | 5.x |
| Linguagem | TypeScript | 5.x |
| Estilo | Tailwind CSS | 3.x |
| Mapas | Leaflet + React-Leaflet | 1.9 + 4.x |
| Gráficos | Recharts + D3.js | 2.x + 7.x |
| Backend/Auth | Supabase | latest |
| Edge Functions | Deno (Supabase) | 1.x |
| Pagamentos | Stripe.js + Stripe Node | latest |
| HTTP Client | ky ou fetch nativo | — |
| RSS Parser | rss-parser | 3.x |
| GeoJSON compressão | pako | 2.x |
| CI/CD | GitHub Actions | — |
| Hospedagem | GitHub Pages | — |
| ETL scripts | Python 3.11 | — |
| Error tracking | Sentry | 7.x |

---

## Estrutura de Pastas do Repositório

```
c2-parana/
├── .github/
│   └── workflows/
│       ├── deploy.yml                 # Build + deploy GitHub Pages
│       ├── cron-clima.yml             # Clima a cada 30min
│       ├── cron-agro.yml              # Agro diário 18h
│       ├── cron-saude.yml             # Saúde semanal seg 8h
│       ├── cron-ambiente.yml          # Ambiente a cada 6h
│       ├── cron-noticias.yml          # Notícias a cada 15min
│       ├── cron-legislativo.yml       # Legislativo diário 9h
│       └── keepalive.yml              # Keepalive do repo
├── public/
│   ├── favicon.ico
│   ├── og-image.png                   # 1200x630 para compartilhamento
│   └── data/
│       └── municipios-pr.geojson      # 399 municípios do PR (gz opcional)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   ├── types/                         # TypeScript interfaces globais
│   │   ├── index.ts
│   │   ├── supabase.ts
│   │   ├── clima.ts
│   │   ├── agro.ts
│   │   ├── saude.ts
│   │   ├── ambiente.ts
│   │   └── noticias.ts
│   ├── lib/
│   │   ├── supabase.ts                # Cliente Supabase
│   │   ├── stripe.ts                  # loadStripe helper
│   │   └── utils.ts                   # formatadores, helpers
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useSubscription.ts
│   │   ├── useClima.ts
│   │   ├── useAgro.ts
│   │   ├── useSaude.ts
│   │   ├── useAmbiente.ts
│   │   └── useNoticias.ts
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── MobileWarning.tsx
│   │   ├── ui/
│   │   │   ├── KpiCard.tsx
│   │   │   ├── SkeletonCard.tsx
│   │   │   ├── AlertBadge.tsx
│   │   │   ├── Sparkline.tsx
│   │   │   ├── LiveIndicator.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── PaywallModal.tsx
│   │   ├── map/
│   │   │   ├── MapContainer.tsx
│   │   │   ├── LayerToggle.tsx
│   │   │   ├── MunicipalityPopup.tsx
│   │   │   ├── MapLegend.tsx
│   │   │   └── layers/
│   │   │       ├── ClimaLayer.tsx
│   │   │       ├── QueimadaLayer.tsx
│   │   │       ├── RioLayer.tsx
│   │   │       ├── DengueLayer.tsx
│   │   │       └── VbpLayer.tsx
│   │   ├── clima/
│   │   │   ├── ClimaWidget.tsx        # Header widget
│   │   │   ├── EstacaoCard.tsx
│   │   │   └── AlertaCard.tsx
│   │   ├── agro/
│   │   │   ├── AgroDashboard.tsx
│   │   │   ├── PrecosDiariosTab.tsx
│   │   │   ├── VbpTab.tsx
│   │   │   ├── ComexTab.tsx
│   │   │   ├── EmpregoTab.tsx
│   │   │   └── CreditoTab.tsx
│   │   ├── saude/
│   │   │   ├── SaudeDashboard.tsx
│   │   │   ├── DengueMap.tsx
│   │   │   └── AlertasMunicipios.tsx
│   │   ├── ambiente/
│   │   │   ├── AmbienteDashboard.tsx
│   │   │   ├── QueimadaMap.tsx
│   │   │   └── QualidadeArCard.tsx
│   │   └── noticias/
│   │       ├── NoticiasFeed.tsx
│   │       ├── NoticiaItem.tsx
│   │       └── AlepFeed.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── ForgotPassword.tsx
│   │   ├── ResetPassword.tsx
│   │   ├── Dashboard.tsx
│   │   ├── MapPage.tsx
│   │   ├── ClimaPage.tsx
│   │   ├── AgroPage.tsx
│   │   ├── SaudePage.tsx
│   │   ├── AmbientePage.tsx
│   │   ├── NoticiasPage.tsx
│   │   ├── LegislativoPage.tsx
│   │   ├── PricingPage.tsx
│   │   ├── CheckoutSuccess.tsx
│   │   └── CheckoutCancel.tsx
│   ├── router/
│   │   ├── index.tsx                  # React Router v6
│   │   └── ProtectedRoute.tsx
│   └── styles/
│       ├── index.css                  # Tailwind directives
│       └── leaflet-overrides.css
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_functions.sql
│   └── functions/
│       ├── create-checkout/
│       │   └── index.ts
│       └── stripe-webhook/
│           └── index.ts
├── scripts/                           # ETL Python (usados nos GitHub Actions)
│   ├── requirements.txt
│   ├── etl_clima.py
│   ├── etl_agro.py
│   ├── etl_saude.py
│   ├── etl_ambiente.py
│   ├── etl_noticias.py
│   └── etl_legislativo.py
├── .env.example
├── .env.local                         # NÃO commitado
├── CLAUDE.md                          # Guia para o Claude Code
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
└── README.md
```

---

## Variáveis de Ambiente

Arquivo `.env.local` na raiz do projeto (nunca commitado):

```bash
# Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Stripe (chaves públicas no frontend)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# APIs externas (usadas no frontend diretamente)
VITE_WAQI_TOKEN=seu_token_waqi
VITE_NASA_FIRMS_KEY=sua_chave_nasa_firms

# Sentry (opcional)
VITE_SENTRY_DSN=https://...@sentry.io/...
```

Secrets no GitHub (para Actions e Edge Functions):

```bash
# GitHub Secrets (para Actions/ETL)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # NÃO o anon key
NASA_FIRMS_KEY=sua_chave
WAQI_TOKEN=seu_token

# Supabase Edge Function secrets (via supabase secrets set)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Fontes de Dados — Endpoints Reais

| Fonte | Endpoint | Frequência |
|-------|----------|-----------|
| INMET estações | `https://apitempo.inmet.gov.br/estacao/dados/{cod}/{dt_ini}/{dt_fim}` | 30min |
| INMET alertas | `https://apialerta.inmet.gov.br/v4/avisos` | 30min |
| InfoDengue | `https://info.dengue.mat.br/api/alertcity?geocode={ibge}&disease=dengue&format=json` | semanal |
| NASA FIRMS | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/VIIRS_SNPP_NRT/-54,-26.7,-48.0,-22.5/1` | 6h |
| AQICN | `https://api.waqi.info/feed/{city}/?token={token}` | 6h |
| IBGE Malhas | `https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json` | estático |
| ALEP | `http://webservices.assembleia.pr.leg.br/api/public` | diário |
| ANA Telemetria | `https://www.ana.gov.br/ANA_Telemetrica/api/estacoes?codEstado=41` | 6h |
| Gazeta do Povo RSS | `https://www.gazetadopovo.com.br/rss` | 15min |
| G1 Paraná RSS | `https://g1.globo.com/rss/g1/parana/` | 15min |
| AEN PR | `https://www.parana.pr.gov.br/noticias` | 15min |
| Banda B RSS | `https://bandab.com.br/feed/` | 15min |
| Google News PR | `https://news.google.com/rss/search?q=Paraná&hl=pt-BR&gl=BR&ceid=BR:pt-419` | 15min |
| SIMA/SEAB Preços | Backend Flask existente no Render.com | diário |

---

## Feature Flags por Plano

| Módulo | Solo (R$49) | Pro (R$149) | Enterprise |
|--------|:-----------:|:-----------:|:----------:|
| Mapa básico | ✓ | ✓ | ✓ |
| Clima | ✓ | ✓ | ✓ |
| Notícias | ✓ | ✓ | ✓ |
| Agronegócio completo | — | ✓ | ✓ |
| Saúde | — | ✓ | ✓ |
| Meio Ambiente | — | ✓ | ✓ |
| Alertas push | — | ✓ | ✓ |
| API access | — | ✓ | ✓ |
| Dados custom | — | — | ✓ |
| SLA + suporte | — | — | ✓ |

---

## Índice de Prompts

| Arquivo | Descrição | Prioridade |
|---------|-----------|-----------|
| [01-SETUP-PROJECT.md](./01-SETUP-PROJECT.md) | Criar projeto Vite + dependências + estrutura | 🔴 Crítico |
| [02-SUPABASE-SETUP.md](./02-SUPABASE-SETUP.md) | Schema SQL + RLS + Edge Functions scaffold | 🔴 Crítico |
| [03-AUTH-AND-PAYWALL.md](./03-AUTH-AND-PAYWALL.md) | Auth completo + trial + Stripe checkout | 🔴 Crítico |
| [04-LAYOUT-AND-NAVIGATION.md](./04-LAYOUT-AND-NAVIGATION.md) | Layout dark + sidebar + header | 🔴 Crítico |
| [05-MAP-MODULE.md](./05-MAP-MODULE.md) | Mapa central Leaflet + layers + municípios | 🟠 Alta |
| [06-CLIMA-MODULE.md](./06-CLIMA-MODULE.md) | Módulo clima INMET + alertas | 🟠 Alta |
| [07-AGRO-MODULE.md](./07-AGRO-MODULE.md) | Módulo agronegócio (Datageo reaproveitado) | 🟠 Alta |
| [08-SAUDE-MODULE.md](./08-SAUDE-MODULE.md) | Módulo saúde InfoDengue + OpenDataSUS | 🟡 Média |
| [09-AMBIENTE-MODULE.md](./09-AMBIENTE-MODULE.md) | Módulo ambiente FIRMS + ANA + AQICN | 🟡 Média |
| [10-NEWS-MODULE.md](./10-NEWS-MODULE.md) | Módulo notícias RSS + ALEP | 🟡 Média |
| [11-GITHUB-ACTIONS-CRONS.md](./11-GITHUB-ACTIONS-CRONS.md) | Todos os workflows ETL + Python scripts | 🔴 Crítico |
| [12-DEPLOY-AND-CI.md](./12-DEPLOY-AND-CI.md) | Deploy GitHub Pages + CI/CD | 🔴 Crítico |
| [13-STRIPE-PLANS.md](./13-STRIPE-PLANS.md) | Produtos Stripe + Edge Functions + webhooks | 🔴 Crítico |
| [14-TESTING-AND-POLISH.md](./14-TESTING-AND-POLISH.md) | Testes E2E + Lighthouse + polimento | 🟡 Média |

---

## Ordem de Execução Recomendada

```
01 → 02 → 03 → 04 → 13 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 14
```

> Execute 01-04 + 13 antes de qualquer módulo de dados. O paywall e auth precisam estar funcionando antes de adicionar conteúdo.
