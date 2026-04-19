# PROMPT 07 — Recomendações Técnicas (pós-launch)

## Contexto
Melhorias estruturais para robustez, segurança e performance. Não são blockers para o MVP mas aumentam significativamente a qualidade da plataforma como SaaS.

---

## 1. RLS para data_cache por plano

### Problema
A tabela `data_cache` tem policy `SELECT` para qualquer `authenticated`. Se um usuário Solo fizer fetch direto via Supabase SDK (via console do browser), obtém dados de módulos Pro (VBP, ComexStat, etc.) sem pagar.

### Solução
Criar uma RPC (Remote Procedure Call) que verifica o plano antes de retornar dados sensíveis:

```sql
-- Migration: RLS avançado para data_cache

-- Adicionar coluna para indicar plano mínimo necessário
ALTER TABLE public.data_cache ADD COLUMN IF NOT EXISTS min_plan TEXT DEFAULT 'solo'
  CHECK (min_plan IN ('solo', 'pro', 'enterprise'));

-- Atualizar cache_keys de módulos Pro
UPDATE public.data_cache SET min_plan = 'pro' WHERE cache_key IN (
  'vbp_kpis_pr', 'vbp_municipios_pr', 'comex_kpis_pr', 
  'emprego_agro_pr', 'credito_rural_pr', 'leitos_sus_pr'
);

-- Dropar a policy antiga e criar nova
DROP POLICY IF EXISTS "Data cache readable by authenticated" ON public.data_cache;

CREATE POLICY "Data cache por plano" ON public.data_cache
  FOR SELECT
  USING (
    -- Service role sempre pode ler (para os ETLs)
    auth.role() = 'service_role'
    OR
    -- Usuários autenticados podem ler dados solo
    (auth.role() = 'authenticated' AND min_plan = 'solo')
    OR
    -- Usuários pro podem ler dados pro
    (auth.role() = 'authenticated' AND min_plan = 'pro' AND EXISTS (
      SELECT 1 FROM public.subscriptions 
      WHERE user_id = auth.uid() 
      AND (
        (status = 'active' AND plan IN ('pro', 'enterprise'))
        OR (status = 'trialing')
      )
    ))
  );
```

---

## 2. Supabase Realtime para notícias

### Problema
O frontend faz polling a cada 30min no feed de notícias (`refetchInterval`). Mesmo que o ETL insira uma notícia urgente, o usuário só vê após o próximo polling.

### Solução
Usar Supabase Realtime para receber inserções em tempo real:

```typescript
// src/hooks/useNoticiasRealtime.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useNoticiasRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('noticias-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        (payload) => {
          // Invalidar cache para forçar refetch
          queryClient.invalidateQueries({ queryKey: ['noticias'] })
          queryClient.invalidateQueries({ queryKey: ['noticias-stats'] })
          
          // Se notícia urgente, mostrar notificação
          if (payload.new.urgency === 'urgent') {
            // Trigger notificação no UI (via toast ou NotificationBell)
            console.log('Notícia urgente:', payload.new.title)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
```

Adicionar o hook no `Layout.tsx` ou `App.tsx`:
```tsx
useNoticiasRealtime()
```

**Nota**: Requer que o Supabase Realtime esteja habilitado para a tabela `news_items` (verificar no Dashboard do Supabase → Database → Replication).

---

## 3. Expandir cobertura de testes

### Problema
Apenas 3 testes Playwright que verificam navegação básica (redirect para login). Sem cobertura de: renderização de dados, interação com KPIs, filtros, paywall.

### Solução
Adicionar testes unitários com Vitest + Testing Library para hooks e componentes:

#### Instalar dependências:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event
```

#### Criar `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

#### Criar `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

#### Exemplo de teste para KpiCard:
```typescript
// tests/components/KpiCard.test.tsx
import { render, screen } from '@testing-library/react'
import { KpiCard } from '@/components/ui/KpiCard'

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Temperatura" value="25.3°C" accentColor="blue" />)
    expect(screen.getByText('Temperatura')).toBeInTheDocument()
    expect(screen.getByText('25.3°C')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<KpiCard label="Teste" value="—" accentColor="blue" loading={true} />)
    // Verificar que há um elemento com animate-pulse
    const card = screen.getByText('Teste').closest('div')
    expect(card?.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
```

#### Exemplo de teste para PaywallModal:
```typescript
// tests/components/PaywallModal.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PaywallModal } from '@/components/ui/PaywallModal'

describe('PaywallModal', () => {
  it('shows feature name and required plan', () => {
    render(
      <MemoryRouter>
        <PaywallModal feature="Saúde" requiredPlan="pro" onClose={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByText(/Saúde/)).toBeInTheDocument()
    expect(screen.getByText(/pro/i)).toBeInTheDocument()
  })
})
```

#### Adicionar script no package.json:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

---

## 4. Configurar ou remover Sentry

### Problema
`VITE_SENTRY_DSN` está listado no `deploy.yml` mas `@sentry/react` não está no `package.json`. O DSN será vazio e não há instrumentação de erros.

### Opção A: Configurar Sentry (recomendado para SaaS)
```bash
npm install @sentry/react
```

Criar `src/lib/sentry.ts`:
```typescript
import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
  })
}
```

Importar em `src/main.tsx`:
```typescript
import './lib/sentry'
```

### Opção B: Remover referência
Remover `VITE_SENTRY_DSN` do `deploy.yml` e de qualquer outro lugar.

---

## 5. Validação de schema com Zod para data_cache

### Problema
Todos os hooks que leem `data_cache` fazem cast `as { field: type }` sem validação. Se o ETL mudar o formato, o frontend quebra silenciosamente.

### Solução
```bash
npm install zod
```

Criar schemas para cada cache_key:
```typescript
// src/types/schemas.ts
import { z } from 'zod'

export const VbpKpisSchema = z.object({
  vbp_total_brl: z.number(),
  vbp_lavoura_brl: z.number(),
  vbp_pecuaria_brl: z.number(),
  variacao_yoy: z.number(),
  ano_referencia: z.number(),
})

export const ComexKpisSchema = z.object({
  exportacoes_usd: z.number(),
  importacoes_usd: z.number(),
  saldo_usd: z.number(),
  variacao_export_yoy: z.number(),
  mes_referencia: z.string(),
})

// ... similar para emprego_agro_pr, credito_rural_pr, leitos_sus_pr
```

Usar nos hooks:
```typescript
const parsed = VbpKpisSchema.safeParse(data?.data)
return parsed.success ? parsed.data : null
```

---

## 6. Mover tokens sensíveis para BFF (Edge Functions)

### Problema
`VITE_WAQI_TOKEN` e `VITE_NASA_FIRMS_KEY` são expostos no bundle JavaScript do frontend. Um usuário pode inspecionar o código e usar os tokens diretamente, potencialmente esgotando cotas.

### Solução
Criar Edge Functions como proxy:

```typescript
// supabase/functions/proxy-aqicn/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { city } = await req.json()
  const token = Deno.env.get('WAQI_TOKEN')
  
  const resp = await fetch(`https://api.waqi.info/feed/${city}/?token=${token}`)
  const data = await resp.json()
  
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Nota: os ETLs rodam server-side (GitHub Actions) onde os tokens já estão em secrets. O frontend não precisa chamar APIs externas diretamente — pode usar os dados já salvos no Supabase. Verificar se o frontend faz alguma chamada direta com esses tokens. Se todas as chamadas são via hooks que leem do Supabase, os tokens `VITE_*` podem ser removidos do frontend.

---

## Critério de Sucesso
- [ ] RLS em `data_cache` diferencia dados por plano (solo vs pro)
- [ ] Realtime habilitado para `news_items` com invalidação de cache no frontend
- [ ] Vitest configurado com pelo menos 5 testes unitários
- [ ] Sentry configurado OU referência removida
- [ ] Schemas Zod para as chaves principais do `data_cache`
- [ ] Tokens sensíveis avaliados (remover `VITE_*` se não necessários no frontend)
