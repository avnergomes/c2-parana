# 01 — SETUP PROJECT: Criar Projeto do Zero

## Descrição
Inicializa o projeto React + Vite + TypeScript, instala todas as dependências, configura Tailwind CSS com design system dark mode, cria a estrutura de pastas completa e arquivos de configuração essenciais.

## Pré-requisitos
- Node.js 20+ instalado
- npm 10+ instalado
- Git configurado com acesso ao GitHub
- Conta no GitHub (avnergomes)

## Variáveis de Ambiente Necessárias Nesta Etapa
Nenhuma ainda — apenas estrutura local.

---

## Prompt para o Claude Code

```
Vou criar o projeto "C2 Paraná" (Command & Control Paraná) — um SaaS dashboard de inteligência territorial do Paraná. Execute os passos abaixo na ordem exata.

## PASSO 1: Criar o projeto Vite

Execute no terminal:
npm create vite@latest c2-parana -- --template react-ts
cd c2-parana
npm install

## PASSO 2: Instalar todas as dependências

npm install \
  @supabase/supabase-js \
  @stripe/stripe-js \
  react-router-dom \
  leaflet \
  react-leaflet \
  recharts \
  d3 \
  pako \
  rss-parser \
  ky \
  clsx \
  tailwind-merge \
  lucide-react \
  @tanstack/react-query \
  date-fns \
  @sentry/react

npm install -D \
  tailwindcss \
  postcss \
  autoprefixer \
  @types/leaflet \
  @types/d3 \
  @types/pako \
  @tailwindcss/forms \
  @tailwindcss/typography \
  vite-plugin-compression

npx tailwindcss init -p

## PASSO 3: Criar tailwind.config.ts

Substitua o tailwind.config.ts gerado por este conteúdo EXATO:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system C2 Paraná
        background: {
          DEFAULT: '#0a0a0f',
          secondary: '#0f1117',
          card: '#111827',
          elevated: '#1a2030',
        },
        accent: {
          green: '#10b981',
          'green-dim': '#065f46',
          blue: '#3b82f6',
          'blue-dim': '#1e3a5f',
        },
        status: {
          danger: '#ef4444',
          warning: '#f59e0b',
          info: '#3b82f6',
          success: '#10b981',
        },
        text: {
          primary: '#f9fafb',
          secondary: '#9ca3af',
          muted: '#4b5563',
        },
        border: {
          DEFAULT: '#1f2937',
          subtle: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.6)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.6)',
        glow: '0 0 12px rgba(16,185,129,0.3)',
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}

export default config
```

## PASSO 4: Criar src/styles/index.css

```css
/* src/styles/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@layer base {
  html {
    @apply bg-background text-text-primary;
  }

  body {
    @apply font-sans antialiased;
    background-color: #0a0a0f;
    color: #f9fafb;
  }

  * {
    @apply border-border;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #0a0a0f;
  }
  ::-webkit-scrollbar-thumb {
    background: #1f2937;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #374151;
  }
}

@layer components {
  .card {
    @apply bg-background-card rounded-card border border-border shadow-card;
  }

  .card-elevated {
    @apply bg-background-elevated rounded-card border border-border shadow-card;
  }

  .btn-primary {
    @apply bg-accent-green hover:bg-emerald-500 text-white font-medium px-4 py-2
           rounded-lg transition-all duration-[120ms] focus:outline-none focus:ring-2
           focus:ring-accent-green focus:ring-offset-2 focus:ring-offset-background;
  }

  .btn-secondary {
    @apply bg-background-elevated hover:bg-background-card text-text-primary
           font-medium px-4 py-2 rounded-lg border border-border transition-all
           duration-[120ms] focus:outline-none focus:ring-2 focus:ring-accent-blue
           focus:ring-offset-2 focus:ring-offset-background;
  }

  .btn-danger {
    @apply bg-status-danger hover:bg-red-600 text-white font-medium px-4 py-2
           rounded-lg transition-all duration-[120ms];
  }

  .input-field {
    @apply bg-background-elevated border border-border text-text-primary
           placeholder:text-text-muted rounded-lg px-3 py-2 text-sm
           focus:outline-none focus:ring-2 focus:ring-accent-blue
           focus:border-accent-blue transition-all duration-[120ms] w-full;
  }

  .kpi-value {
    @apply font-mono text-2xl font-semibold text-text-primary;
  }

  .kpi-label {
    @apply text-xs font-medium text-text-secondary uppercase tracking-wider;
  }

  .badge-danger {
    @apply bg-red-900/40 text-status-danger border border-red-700/50 text-xs font-medium px-2 py-0.5 rounded-full;
  }

  .badge-warning {
    @apply bg-amber-900/40 text-status-warning border border-amber-700/50 text-xs font-medium px-2 py-0.5 rounded-full;
  }

  .badge-success {
    @apply bg-emerald-900/40 text-status-success border border-emerald-700/50 text-xs font-medium px-2 py-0.5 rounded-full;
  }

  .badge-info {
    @apply bg-blue-900/40 text-status-info border border-blue-700/50 text-xs font-medium px-2 py-0.5 rounded-full;
  }
}
```

## PASSO 5: Criar src/styles/leaflet-overrides.css

```css
/* src/styles/leaflet-overrides.css */
/* Adapta o Leaflet ao dark theme do C2 Paraná */

.leaflet-container {
  background: #0f1117 !important;
  font-family: 'Inter', sans-serif;
}

.leaflet-popup-content-wrapper {
  background: #111827 !important;
  border: 1px solid #1f2937 !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,0.6) !important;
  color: #f9fafb !important;
}

.leaflet-popup-tip {
  background: #111827 !important;
}

.leaflet-popup-close-button {
  color: #9ca3af !important;
}

.leaflet-control-zoom a {
  background: #111827 !important;
  border-color: #1f2937 !important;
  color: #f9fafb !important;
}

.leaflet-control-zoom a:hover {
  background: #1a2030 !important;
}

.leaflet-control-attribution {
  background: rgba(10, 10, 15, 0.8) !important;
  color: #4b5563 !important;
  font-size: 10px !important;
}

.leaflet-control-attribution a {
  color: #6b7280 !important;
}

.leaflet-tile-pane {
  filter: brightness(0.7) saturate(0.6) hue-rotate(180deg) invert(1);
}
```

## PASSO 6: Atualizar src/main.tsx

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './styles/index.css'
import './styles/leaflet-overrides.css'
import 'leaflet/dist/leaflet.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

## PASSO 7: Criar src/App.tsx (placeholder — será substituído no prompt 04)

```typescript
// src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-accent-green font-mono">C2 Paraná</h1>
        <p className="text-text-secondary mt-2">Sistema inicializado. Execute o prompt 04.</p>
      </div>
    </div>
  )
}
```

## PASSO 8: Criar src/lib/utils.ts

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function getBadgeClass(level: 'danger' | 'warning' | 'success' | 'info'): string {
  const map = {
    danger: 'badge-danger',
    warning: 'badge-warning',
    success: 'badge-success',
    info: 'badge-info',
  }
  return map[level]
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
```

## PASSO 9: Criar src/types/index.ts

```typescript
// src/types/index.ts

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  updated_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  plan: 'solo' | 'pro' | 'enterprise'
  trial_end: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionPlan = 'solo' | 'pro' | 'enterprise'

export interface FeatureAccess {
  clima: boolean
  noticias: boolean
  mapa_basico: boolean
  agro: boolean
  saude: boolean
  ambiente: boolean
  alertas_push: boolean
  api_access: boolean
}

export const PLAN_FEATURES: Record<SubscriptionPlan | 'trial', FeatureAccess> = {
  trial: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: false,
    api_access: false,
  },
  solo: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: false,
    saude: false,
    ambiente: false,
    alertas_push: false,
    api_access: false,
  },
  pro: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: true,
    api_access: true,
  },
  enterprise: {
    clima: true,
    noticias: true,
    mapa_basico: true,
    agro: true,
    saude: true,
    ambiente: true,
    alertas_push: true,
    api_access: true,
  },
}
```

## PASSO 10: Criar src/lib/supabase.ts (placeholder)

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env.local and fill in.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

## PASSO 11: Criar .env.example

```bash
# .env.example — copie para .env.local e preencha os valores reais

# Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (chave pública)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# APIs externas
VITE_WAQI_TOKEN=demo
VITE_NASA_FIRMS_KEY=DEMO_KEY

# Sentry (opcional)
VITE_SENTRY_DSN=
```

## PASSO 12: Criar vite.config.ts

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { compression } from 'vite-plugin-compression'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Para GitHub Pages com repositório em subpasta
  // Alterar para o nome real do repo:
  base: mode === 'production' ? '/c2-parana/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          maps: ['leaflet', 'react-leaflet'],
          charts: ['recharts', 'd3'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
  },
}))
```

## PASSO 13: Atualizar tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## PASSO 14: Criar CLAUDE.md

```markdown
# CLAUDE.md — Guia para Claude Code: C2 Paraná

## Sobre o Projeto
C2 Paraná é um SaaS dashboard de inteligência territorial do estado do Paraná.
Stack: React 18 + Vite + TypeScript + Tailwind CSS + Supabase + Stripe + Leaflet + Recharts

## Convenções de Código

### Estrutura de Componentes
- Componentes em PascalCase: `ClimaWidget.tsx`
- Hooks em camelCase começando com "use": `useClima.ts`
- Utilitários em camelCase: `utils.ts`
- Um componente por arquivo
- Props interface no mesmo arquivo: `interface ClimaWidgetProps { ... }`

### Imports
- Absolutos com @ alias: `import { supabase } from '@/lib/supabase'`
- Tipos separados: `import type { Subscription } from '@/types'`
- CSS modules ou Tailwind (sem styled-components)

### Tailwind
- Usar classes do design system definidas em tailwind.config.ts
- Cores: background-card, accent-green, accent-blue, status-danger, etc.
- Components utilitários no index.css: `.card`, `.btn-primary`, `.input-field`
- cn() helper do clsx+tailwind-merge para classes condicionais

### Estado
- useState para estado local simples
- @tanstack/react-query para dados de servidor (fetch, cache, refetch)
- AuthContext para estado de autenticação global
- URL state (searchParams) para filtros e estado do mapa

### Supabase
- Cliente singleton em @/lib/supabase.ts
- RLS ativo: queries são automaticamente filtradas pelo user_id
- Edge Functions chamadas via supabase.functions.invoke()

### Error Handling
- ErrorBoundary em volta de cada módulo de página
- try/catch em todos os fetches
- Toast/notification para erros do usuário
- console.error para erros internos (Sentry captura)

## Comandos Úteis
- `npm run dev` — servidor de desenvolvimento na porta 3000
- `npm run build` — build de produção
- `npm run preview` — preview do build
- `npx supabase start` — Supabase local (se instalado)
- `npx supabase gen types typescript` — regenerar tipos do banco

## Endpoints Principais
- Supabase: $VITE_SUPABASE_URL
- Edge Functions: $VITE_SUPABASE_URL/functions/v1/{nome}
- INMET: https://apitempo.inmet.gov.br
- InfoDengue: https://info.dengue.mat.br/api
- NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/api
- AQICN: https://api.waqi.info

## Design System
- Fundo: #0a0a0f
- Cards: #111827
- Acento verde: #10b981
- Acento azul: #3b82f6
- Alerta: #ef4444
- Warning: #f59e0b
- Font: Inter (body), JetBrains Mono (dados)
```

## PASSO 15: Criar estrutura de pastas vazia

Execute os comandos:
mkdir -p src/{types,lib,hooks,contexts,components/{layout,ui,map/layers,clima,agro,saude,ambiente,noticias},pages,router,styles}
mkdir -p supabase/{migrations,functions/{create-checkout,stripe-webhook}}
mkdir -p scripts
mkdir -p public/data
mkdir -p .github/workflows

Crie os arquivos placeholder (serão preenchidos nos próximos prompts):
touch src/types/{supabase,clima,agro,saude,ambiente,noticias}.ts
touch src/hooks/{useAuth,useSubscription,useClima,useAgro,useSaude,useAmbiente,useNoticias}.ts
touch src/contexts/AuthContext.tsx
touch src/router/{index,ProtectedRoute}.tsx
touch supabase/functions/create-checkout/index.ts
touch supabase/functions/stripe-webhook/index.ts

## PASSO 16: Verificação

Execute:
npm run dev

Deve abrir http://localhost:3000 mostrando a tela placeholder com "C2 Paraná" em verde.

Execute também:
npm run build

Deve completar sem erros (podem aparecer warnings de variáveis não usadas nos placeholders).
```

---

## Arquivos Criados/Modificados

```
c2-parana/
├── package.json                       (criado pelo Vite + atualizado com deps)
├── tailwind.config.ts                 (SUBSTITUÍDO completamente)
├── vite.config.ts                     (SUBSTITUÍDO completamente)
├── tsconfig.json                      (ATUALIZADO com paths)
├── .env.example                       (CRIADO)
├── CLAUDE.md                          (CRIADO)
├── src/
│   ├── main.tsx                       (SUBSTITUÍDO)
│   ├── App.tsx                        (SUBSTITUÍDO — placeholder)
│   ├── lib/
│   │   ├── supabase.ts                (CRIADO — placeholder)
│   │   └── utils.ts                   (CRIADO)
│   ├── types/
│   │   └── index.ts                   (CRIADO)
│   └── styles/
│       ├── index.css                  (SUBSTITUÍDO)
│       └── leaflet-overrides.css      (CRIADO)
└── (estrutura de pastas vazia)
```

---

## Verificação

1. `npm run dev` → `http://localhost:3000` mostra "C2 Paraná" em verde sobre fundo preto
2. `npm run build` → completa sem erros críticos
3. Tailwind dark theme aplicado: body deve ter `background: #0a0a0f`
4. Fontes Inter e JetBrains Mono carregadas (verificar no DevTools → Network → fonts)

---

## Notas Técnicas

- **base path no vite.config**: Está definido como `/c2-parana/` para GitHub Pages. Se o nome do repositório for diferente, ajuste o `base` em `vite.config.ts`.
- **leaflet-overrides.css**: O filtro CSS `filter: brightness(0.7) saturate(0.6) hue-rotate(180deg) invert(1)` inverte o tile do mapa para dark mode. Funciona com tiles do OpenStreetMap. Para Mapbox/MapTiler tiles nativamente escuros, remover esse filtro.
- **pako**: Usado para descomprimir GeoJSON.gz no browser, economizando ~70% de bandwidth no carregamento do mapa.
- **@tanstack/react-query**: Centraliza cache e refetch de dados. Stale time de 5min por padrão.
- **vite-plugin-compression**: Gera `.gz` e `.br` no build. GitHub Pages serve arquivos estáticos mas não faz content negotiation automático — o browser pedirá o `.js` normal. Para servir comprimidos, usar Cloudflare CDN na frente.
