# PROMPT 06 — [BAIXO] Polish e Cleanup

## Contexto
5 bugs de baixa prioridade que melhoram a qualidade do código e evitam problemas futuros.

---

## Bug #12: vite.config.ts base hardcoded

### Arquivo: `vite.config.ts`, linha 20

**Problema**: `base: mode === 'production' ? '/c2-parana/' : '/'` — se o repositório for renomeado, o deploy quebra silenciosamente.

**Correção**: Usar variável de ambiente ou extrair do `package.json`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import path from 'path'
import pkg from './package.json'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip', ext: '.gz' }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Base path para GitHub Pages — derivado do nome do package
  // Se o repo mudar de nome, atualizar o "name" no package.json
  base: mode === 'production' ? `/${pkg.name}/` : '/',
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

**Nota**: Isso requer que o `package.json` tenha `"name": "c2-parana"` (já tem) e que o import de JSON funcione. Em Vite com `"type": "module"`, pode ser necessário habilitar `resolveJsonModule` no `tsconfig.node.json` (geralmente já está habilitado).

Alternativa mais simples: apenas adicionar um comentário:
```typescript
// ⚠️ Se renomear o repositório, atualizar aqui também
base: mode === 'production' ? '/c2-parana/' : '/',
```

---

## Bug #13: lucide-react não utilizado

### Arquivo: `package.json`, linha 30

**Problema**: `"lucide-react": "^0.303.0"` está listado como dependência mas todos os ícones no projeto são SVG inline. A dependência adiciona ~150KB ao bundle se importada em algum lugar.

**Verificação**: Antes de remover, confirmar que nenhum arquivo importa de lucide-react:
```bash
grep -r "lucide-react" src/ --include="*.tsx" --include="*.ts"
```

Se nenhum resultado, remover:
```bash
npm uninstall lucide-react
```

Também remover `pako` e `ky` se não estiverem sendo usados:
```bash
grep -r "from 'pako'" src/ --include="*.tsx" --include="*.ts"
grep -r "from 'ky'" src/ --include="*.tsx" --include="*.ts"
```

Se nenhum resultado, remover:
```bash
npm uninstall pako ky
# E remover @types/pako das devDependencies
npm uninstall @types/pako
```

---

## Bug #14: etl_saude.py com ano hardcoded

### Arquivo: `scripts/etl_saude.py`, linha 35

**Problema**: `ey_end=2025` hardcoded na URL do InfoDengue. Em 2026 (agora!), não buscará dados do ano atual.

**De**:
```python
url = f"https://info.dengue.mat.br/api/alertcity?geocode={ibge_code}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start=2024&ey_end=2025"
```

**Para**:
```python
from datetime import datetime

current_year = datetime.now().year
url = f"https://info.dengue.mat.br/api/alertcity?geocode={ibge_code}&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start={current_year - 1}&ey_end={current_year}"
```

Também atualizar o fallback de `year` na linha 62:
**De**:
```python
year = int(str(se)[:4]) if se > 10000 else 2025
```

**Para**:
```python
year = int(str(se)[:4]) if se > 10000 else current_year
```

Nota: `current_year` precisa ser definido no escopo de `main()` ou como constante global.

---

## Bug #15: KPIs "Cobertura" hardcoded em Clima e Ambiente

### Arquivo: `src/pages/ClimaPage.tsx`, linha 42

**De**:
```tsx
<KpiCard label="Cobertura" value="~20 estações" accentColor="green" />
```

**Para**:
```tsx
<KpiCard 
  label="Cobertura" 
  value={estacoes?.length ? `${estacoes.length} estações` : '—'} 
  accentColor="green" 
  loading={loadingEstacoes} 
/>
```

### Arquivo: `src/pages/AmbientePage.tsx`, linha 55

**De**:
```tsx
<KpiCard label="Cobertura monitoramento" value="4 cidades" accentColor="blue" />
```

**Para**:
```tsx
<KpiCard 
  label="Cobertura monitoramento" 
  value={aqData?.length ? `${aqData.length} cidades` : '—'} 
  accentColor="blue" 
/>
```

---

## Bug #16: STRIPE_PRICE_SOLO/PRO sem documentação de setup

### Arquivo: `supabase/functions/create-checkout/index.ts`

**Problema**: Se as env vars `STRIPE_PRICE_SOLO` e `STRIPE_PRICE_PRO` não estiverem configuradas, a Edge Function retorna erro 400 sem mensagem útil.

Adicionar validação com mensagem clara no início da função:

```typescript
const priceId = plan === 'pro'
  ? Deno.env.get('STRIPE_PRICE_PRO')
  : Deno.env.get('STRIPE_PRICE_SOLO')

if (!priceId) {
  return new Response(
    JSON.stringify({ 
      error: `Stripe price ID para plano "${plan}" não configurado. Configure STRIPE_PRICE_${plan.toUpperCase()} nos secrets do Supabase.` 
    }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

### Arquivo: Criar `docs/SETUP_STRIPE.md` (novo)

```markdown
# Configuração do Stripe

## 1. Criar Price IDs no Stripe Dashboard

1. Acesse https://dashboard.stripe.com/products
2. Crie um produto "C2 Paraná Solo" com preço R$ 49,00/mês (BRL, recurring)
3. Crie um produto "C2 Paraná Pro" com preço R$ 149,00/mês (BRL, recurring)
4. Copie os Price IDs (começam com `price_`)

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
Cartão de teste: `4242 4242 4242 4242`, qualquer data futura, qualquer CVC.
```

---

## Critério de Sucesso
- [ ] `vite.config.ts` tem comentário ou lógica dinâmica para o `base`
- [ ] Dependências não utilizadas (`lucide-react`, `pako`, `ky`) removidas do `package.json`
- [ ] `etl_saude.py` usa `datetime.now().year` ao invés de `2025` hardcoded
- [ ] KPIs de cobertura em ClimaPage e AmbientePage são dinâmicos
- [ ] Edge Function `create-checkout` retorna erro 500 descritivo quando price ID falta
- [ ] `docs/SETUP_STRIPE.md` existe com instruções de configuração
