# 12 — DEPLOY AND CI/CD: GitHub Pages + Build Pipeline

## Descrição
Configura o deploy automático no GitHub Pages via GitHub Actions, ajusta o Vite para o base path correto, configura domínio customizado (opcional), adiciona Sentry para error tracking e cria checklist de produção.

## Pré-requisitos
- Prompts 01–04 concluídos (projeto funcional localmente)
- Repositório no GitHub criado e código commitado
- Supabase configurado (prompt 02)
- Secrets configurados no repositório

## Secrets Necessários no GitHub Actions (para deploy)

Configure em Settings → Secrets and variables → Actions:
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_WAQI_TOKEN=seu_token
VITE_NASA_FIRMS_KEY=sua_chave
VITE_SENTRY_DSN=https://...@sentry.io/...  (opcional)
```

---

## Prompt para o Claude Code

```
Vou configurar o deploy no GitHub Pages e CI/CD para o C2 Paraná. Execute todos os passos.

## PASSO 1: Verificar e ajustar vite.config.ts para GitHub Pages

Certifique-se que o `base` no vite.config.ts corresponde ao nome do repositório:

```typescript
// vite.config.ts — trecho relevante
export default defineConfig(({ mode }) => ({
  // Altere '/c2-parana/' para o nome REAL do seu repositório no GitHub
  // Ex: se o repo é 'avnergomes/parana-monitor', use '/parana-monitor/'
  base: mode === 'production' ? '/c2-parana/' : '/',
  // ... resto da config
}))
```

Se usar domínio customizado (ex: app.ccparana.com.br), o base deve ser '/':
```typescript
base: '/',
```

## PASSO 2: Criar .github/workflows/deploy.yml

```yaml
# .github/workflows/deploy.yml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Instalar dependências
        run: npm ci

      - name: Build Vite
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: ${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY }}
          VITE_WAQI_TOKEN: ${{ secrets.VITE_WAQI_TOKEN }}
          VITE_NASA_FIRMS_KEY: ${{ secrets.VITE_NASA_FIRMS_KEY }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
        run: npm run build

      - name: Upload artifact para GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy para GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## PASSO 3: Configurar GitHub Pages no repositório

No GitHub, acessar:
Settings → Pages → Source → GitHub Actions

(Não usar "Deploy from a branch" — usar "GitHub Actions")

## PASSO 4: Criar public/404.html para SPA routing

GitHub Pages serve 404.html quando a rota não é encontrada.
Para React Router funcionar com refresh, crie public/404.html:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>C2 Paraná</title>
  <script>
    // Redirect para index.html com o path como query string
    // Técnica de GitHub Pages SPA: github.com/rafgraph/spa-github-pages
    var segmentCount = 1; // 1 = repositório em subpasta; 0 = domínio raiz
    var l = window.location;
    l.replace(
      l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
      l.pathname.split('/').slice(0, 1 + segmentCount).join('/') + '/?/' +
      l.pathname.slice(1).split('/').slice(segmentCount).join('/').replace(/&/g, '~and~') +
      (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
      l.hash
    );
  </script>
</head>
</html>
```

## PASSO 5: Adicionar script de redirect no index.html

No arquivo index.html, adicione dentro do `<head>` antes de qualquer outro script:

```html
<!-- GitHub Pages SPA redirect -->
<script>
  (function(l) {
    if (l.search[1] === '/') {
      var decoded = l.search.slice(1).split('&').map(function(s) {
        return s.replace(/~and~/g, '&')
      }).join('?');
      window.history.replaceState(null, null,
        l.pathname.slice(0, -1) + decoded + l.hash
      );
    }
  }(window.location))
</script>
```

## PASSO 6: Criar public/CNAME (se usar domínio customizado)

Se tiver um domínio customizado (ex: app.ccparana.com.br):

```
app.ccparana.com.br
```

Configurar DNS:
- Tipo A: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- Tipo CNAME: www → avnergomes.github.io

No repositório: Settings → Pages → Custom domain → app.ccparana.com.br
GitHub irá criar um certificado SSL automático via Let's Encrypt.

⚠️ Se usar domínio customizado, mude o `base` no vite.config.ts para '/'

## PASSO 7: Configurar Sentry (opcional mas recomendado)

Instalar Sentry:
npm install @sentry/react @sentry/vite-plugin --save

Atualizar vite.config.ts:
```typescript
import { sentryVitePlugin } from "@sentry/vite-plugin"

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Apenas em produção com DSN configurado
    mode === 'production' && process.env.VITE_SENTRY_DSN
      ? sentryVitePlugin({
          org: "seu-org-sentry",
          project: "c2-parana",
          authToken: process.env.SENTRY_AUTH_TOKEN,
        })
      : null,
  ].filter(Boolean),
  // ... resto
  build: {
    sourcemap: true, // Necessário para Sentry
    // ...
  }
}))
```

Inicializar Sentry no src/main.tsx:
```typescript
import * as Sentry from "@sentry/react"

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  })
}
```

## PASSO 8: Adicionar workflow de CI (lint + type-check)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: TypeScript check
        run: npx tsc --noEmit
      - name: Build check
        env:
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: eyJplaceholder
          VITE_STRIPE_PUBLISHABLE_KEY: pk_test_placeholder
          VITE_WAQI_TOKEN: demo
          VITE_NASA_FIRMS_KEY: DEMO_KEY
        run: npm run build
```

## PASSO 9: Atualizar package.json com scripts úteis

Adicionar ao package.json (seção "scripts"):
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "etl:clima": "cd scripts && python etl_clima.py",
    "etl:noticias": "cd scripts && python etl_noticias.py"
  }
}
```

## PASSO 10: Criar README.md

```markdown
# C2 Paraná — Command & Control

Dashboard de inteligência territorial do Paraná.

## Stack
- React 18 + Vite + TypeScript + Tailwind CSS
- Supabase (Auth + PostgreSQL + Edge Functions)
- Leaflet + Recharts
- GitHub Actions (ETL crons)
- GitHub Pages (hosting)

## Setup Local

1. Clone o repositório
2. `npm install`
3. Copie `.env.example` para `.env.local` e preencha as variáveis
4. `npm run dev`

## Deploy

Push para `main` → GitHub Actions faz build e deploy automático.

## Módulos
- 🗺 Mapa Central (Leaflet, 399 municípios PR)
- 🌤 Clima (INMET, atualização 30min)
- 🌾 Agronegócio (VBP, preços, ComexStat)
- 🏥 Saúde (InfoDengue, leitos SUS)
- 🌿 Meio Ambiente (FIRMS, ANA, AQICN)
- 📰 Notícias (RSS, ALEP)

## Licença
Proprietário — © 2025 C2 Paraná
```
```

---

## Arquivos Criados/Modificados

```
.github/workflows/
├── deploy.yml                            (CRIADO)
└── ci.yml                                (CRIADO)
public/
├── 404.html                              (CRIADO)
└── CNAME                                 (CRIADO — se domínio customizado)
index.html                                (ATUALIZADO — script SPA redirect)
vite.config.ts                            (ATUALIZADO — sourcemap + Sentry)
README.md                                 (CRIADO)
```

---

## Verificação

1. Push para `main` → Actions tab mostra workflow "Deploy GitHub Pages" executando
2. Após ~2min, URL `https://avnergomes.github.io/c2-parana/` abre o dashboard
3. Navegar para `/dashboard`, copiar URL, abrir aba privada e colar → página funciona (SPA routing)
4. Navegar para URL inexistente → redireciona para dashboard (não mostra 404 do GitHub)

---

## Checklist de Produção

Antes de divulgar a URL publicamente, verificar:

- [ ] `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurados nos Secrets do GitHub Actions
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` usando chave **live** (não test)
- [ ] Webhook do Stripe apontando para a Edge Function do Supabase
- [ ] RLS policies ativas em todas as tabelas (verificar com usuário não-autenticado)
- [ ] Google OAuth configurado com redirect URL de produção
- [ ] Sentry DSN configurado para monitorar erros
- [ ] Todos os workflows de cron ativos (verde no Actions tab)
- [ ] GeoJSON dos 399 municípios em `public/data/municipios-pr.geojson`
- [ ] Dados iniciais populados no Supabase (executar ETLs manualmente uma vez)
- [ ] Meta tags e og:image configurados no index.html
- [ ] Banner LGPD presente
- [ ] Teste de login/registro/checkout em produção com Stripe live

---

## Notas Técnicas

- **GitHub Pages SPA**: O hack do 404.html é necessário porque GitHub Pages serve arquivos estáticos e não conhece o React Router. Qualquer rota direta (ex: `/dashboard`) retorna 404 sem esse hack.
- **Secrets nas variáveis VITE_**: As variáveis `VITE_*` são incorporadas no bundle JavaScript no momento do build — são visíveis no código-fonte do browser. Nunca colocar chaves secretas (service_role, stripe_secret) como `VITE_*`. Use apenas chaves públicas (anon_key, pk_live_).
- **base path**: Se o nome do repositório mudar, atualizar `base` no vite.config.ts e `segmentCount` no 404.html.
- **Sourcemaps**: `build.sourcemap: true` gera sourcemaps para o Sentry mapear erros no código TypeScript original. Os .map files são grandes (+5MB) mas não afetam performance do browser pois só são baixados quando DevTools está aberto.
