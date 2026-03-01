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
