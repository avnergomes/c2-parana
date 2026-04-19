# 14 — TESTING AND POLISH: Testes, Performance e Polimento Final

## Descrição
Implementa testes E2E com Playwright, audita performance com Lighthouse, adiciona error boundaries em todos os módulos, estados vazios, loading states consistentes, SEO meta tags, og:image e polimentos finais antes do lançamento.

## Pré-requisitos
- Todos os prompts anteriores concluídos
- Projeto funcional e deployado no GitHub Pages

---

## Prompt para o Claude Code

```
Vou implementar testes, polimento final e checklist de qualidade para o C2 Paraná. Execute todos os passos.

## PASSO 1: Instalar Playwright

npm install -D @playwright/test
npx playwright install chromium

## PASSO 2: Criar playwright.config.ts

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## PASSO 3: Criar tests/auth.spec.ts

```typescript
// tests/auth.spec.ts
import { test, expect } from '@playwright/test'

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@ccparana.test'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword123'

test.describe('Autenticação', () => {
  test('Página de login carrega', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/C2 Paraná|Paraná Monitor/)
    await expect(page.locator('h2')).toContainText('Entrar')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('Redirect para /login quando não autenticado', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Registro mostra campos corretos', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="Nome"]')).toBeVisible()
  })

  test('Página de preços carrega sem login', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('h1')).toContainText('Planos')
    await expect(page.locator('text=Solo')).toBeVisible()
    await expect(page.locator('text=Pro')).toBeVisible()
  })

  test('Link Esqueceu a senha presente', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('a[href*="forgot"]')).toBeVisible()
  })
})
```

## PASSO 4: Criar tests/navigation.spec.ts

```typescript
// tests/navigation.spec.ts
import { test, expect } from '@playwright/test'

// Estes testes assumem que o usuário já está logado
// Para setup de autenticação, usar storageState do Playwright

test.describe('Navegação (autenticado)', () => {
  // Setup: fazer login antes dos testes
  test.beforeEach(async ({ page }) => {
    // Para testes locais, podemos mockar a autenticação
    // ou usar um usuário de teste com trial ativo
    await page.goto('/login')
    // Verificar se já está logado (tem session)
    const url = page.url()
    if (url.includes('/login')) {
      // Preencher login se necessário
      const email = process.env.TEST_EMAIL
      const password = process.env.TEST_PASSWORD
      if (email && password) {
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)
        await page.click('button[type="submit"]')
        await page.waitForURL(/\/dashboard/)
      }
    }
  })

  test('Header é visível com logo e relógio', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('text=C2 PARANÁ')).toBeVisible()
    // Relógio deve mostrar formato HH:MM:SS
    await expect(page.locator('.font-mono').first()).toBeVisible()
  })

  test('Sidebar contém módulos', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('nav a[href*="/mapa"]')).toBeVisible()
    await expect(page.locator('nav a[href*="/clima"]')).toBeVisible()
    await expect(page.locator('nav a[href*="/noticias"]')).toBeVisible()
  })

  test('Sidebar colapsa ao clicar no chevron', async ({ page }) => {
    await page.goto('/dashboard')
    // Sidebar começa expandida (256px)
    const sidebar = page.locator('aside')
    await expect(sidebar).toHaveCSS('width', '224px')

    // Clicar no botão de colapso
    await page.locator('aside button').first().click()
    await page.waitForTimeout(200) // Aguardar transição

    // Sidebar deve ter ~56px (colapsada)
    await expect(sidebar).toHaveCSS('width', '56px')
  })

  test('Navegar para /clima', async ({ page }) => {
    await page.goto('/clima')
    await expect(page.locator('h1')).toContainText('Clima')
  })

  test('Navegar para /noticias', async ({ page }) => {
    await page.goto('/noticias')
    await expect(page.locator('h1')).toContainText('Notícias')
  })
})
```

## PASSO 5: Criar tests/map.spec.ts

```typescript
// tests/map.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Mapa Central', () => {
  test.beforeEach(async ({ page }) => {
    // Assumir autenticado ou usar mocked session
    await page.goto('/mapa')
  })

  test('Mapa Leaflet carrega', async ({ page }) => {
    // Aguardar container do Leaflet
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })
  })

  test('Layer toggle está presente', async ({ page }) => {
    await expect(page.locator('text=Camadas')).toBeVisible()
    await expect(page.locator('text=Clima')).toBeVisible()
  })

  test('URL state: layers aparecem na URL', async ({ page }) => {
    // Clicar no layer de clima
    await page.locator('button:has-text("Clima")').click()
    await expect(page).toHaveURL(/layers=/)
  })
})
```

## PASSO 6: Criar src/components/ui/EmptyState.tsx

```typescript
// src/components/ui/EmptyState.tsx
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm">{description}</p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-4 text-sm px-4 py-2">
          {action.label}
        </button>
      )}
    </div>
  )
}
```

## PASSO 7: Criar src/components/ui/AlertBadge.tsx

```typescript
// src/components/ui/AlertBadge.tsx
import { cn } from '@/lib/utils'

type BadgeLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

interface AlertBadgeProps {
  level: BadgeLevel
  label?: string
  count?: number
  className?: string
}

const BADGE_STYLES: Record<BadgeLevel, string> = {
  critical: 'bg-red-900/40 text-status-danger border-red-700/50',
  high: 'bg-orange-900/40 text-orange-400 border-orange-700/50',
  medium: 'bg-amber-900/40 text-status-warning border-amber-700/50',
  low: 'bg-emerald-900/40 text-status-success border-emerald-700/50',
  info: 'bg-blue-900/40 text-status-info border-blue-700/50',
}

export function AlertBadge({ level, label, count, className }: AlertBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border',
      BADGE_STYLES[level],
      className
    )}>
      {label || level}
      {count !== undefined && (
        <span className="font-mono font-bold">{count}</span>
      )}
    </span>
  )
}
```

## PASSO 8: Atualizar index.html com SEO meta tags e og:image

Substituir o conteúdo do `<head>` no index.html:

```html
<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- SEO -->
  <title>C2 Paraná — Inteligência Territorial</title>
  <meta name="description" content="Dashboard de inteligência territorial do Paraná. Clima, agronegócio, saúde, meio ambiente, notícias e legislativo em tempo real." />
  <meta name="keywords" content="Paraná, monitoramento, dashboard, clima, agronegócio, dengue, queimadas, inteligência territorial" />
  <meta name="author" content="C2 Paraná" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://avnergomes.github.io/c2-parana/" />
  <meta property="og:title" content="C2 Paraná — Inteligência Territorial" />
  <meta property="og:description" content="Monitore o Paraná em tempo real: clima, agronegócio, saúde, meio ambiente e notícias." />
  <meta property="og:image" content="https://avnergomes.github.io/c2-parana/og-image.png" />
  <meta property="og:locale" content="pt_BR" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="C2 Paraná" />
  <meta name="twitter:description" content="Inteligência territorial do Paraná em tempo real." />
  <meta name="twitter:image" content="https://avnergomes.github.io/c2-parana/og-image.png" />

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" href="/favicon.png" />

  <!-- Theme color (Android/Chrome) -->
  <meta name="theme-color" content="#0a0a0f" />

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
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

## PASSO 9: Criar public/favicon.svg

```svg
<!-- public/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0a0a0f"/>
  <rect x="2" y="2" width="28" height="28" rx="5" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="16" y="22" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#10b981">CC</text>
</svg>
```

## PASSO 10: Criar og:image

Execute o script Python para gerar o og:image (1200x630px):

Alternativamente, criar uma imagem simples com texto:
- Fundo: #0a0a0f
- Logo "C2 PARANÁ" em verde (#10b981) fonte monospace
- Subtítulo: "Inteligência Territorial do Paraná"
- Ícones pequenos dos módulos
- Salvar como public/og-image.png (1200×630)

Pode usar o Canva, Figma ou qualquer editor gráfico para criar.

## PASSO 11: Criar src/components/ui/NotificationBell.tsx

```typescript
// src/components/ui/NotificationBell.tsx
import { useState } from 'react'
import { useAlertasINMET } from '@/hooks/useClima'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: alertas } = useAlertasINMET()
  const activeAlerts = alertas?.filter(a => a.is_active) || []

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-text-muted hover:text-text-primary transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {activeAlerts.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-status-danger rounded-full text-white text-2xs flex items-center justify-center font-bold">
            {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 card border border-border shadow-card-hover z-50 animate-fade-in">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Alertas Ativos</p>
            <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {activeAlerts.length === 0 ? (
              <p className="p-4 text-sm text-text-muted text-center">Sem alertas ativos</p>
            ) : (
              activeAlerts.map(alert => (
                <div key={alert.id} className="p-3 border-b border-border/50 last:border-0">
                  <p className="text-xs font-medium text-text-primary line-clamp-2">{alert.title}</p>
                  <p className="text-2xs text-text-muted mt-0.5 capitalize">{alert.severity}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

Adicionar `<NotificationBell />` no Header.tsx, antes do relógio.

## PASSO 12: Adicionar ao package.json scripts de teste

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:report": "playwright show-report"
  }
}
```

## PASSO 13: Criar .github/workflows/test.yml (opcional)

```yaml
# .github/workflows/test.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Run E2E tests (public pages only)
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: pk_test_placeholder
          VITE_WAQI_TOKEN: demo
          VITE_NASA_FIRMS_KEY: DEMO_KEY
        run: npx playwright test tests/auth.spec.ts
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## PASSO 14: Checklist final de polimento

Execute cada item e marque como concluído:

**Performance:**
- [ ] `npm run build` sem warnings de chunk acima de 1MB
- [ ] Lighthouse score > 80 em Performance (via Chrome DevTools)
- [ ] Lighthouse score > 90 em Accessibility
- [ ] Imagens com lazy loading (`loading="lazy"`)
- [ ] GeoJSON servido com header `Cache-Control: max-age=86400`

**UX:**
- [ ] Todas as páginas têm estados de loading (skeleton ou spinner)
- [ ] Todas as páginas têm estados vazios (EmptyState component)
- [ ] ErrorBoundary em volta de cada módulo de dados
- [ ] Mensagens de erro amigáveis (não expor detalhes técnicos)
- [ ] MobileWarning funciona em viewport < 768px

**SEO e compartilhamento:**
- [ ] Meta description única para cada página (via React Helmet ou title update)
- [ ] og:image criado e acessível em /og-image.png
- [ ] Favicon.svg e favicon.png criados
- [ ] HTML lang="pt-BR"

**Segurança:**
- [ ] RLS ativo em todas as tabelas do Supabase
- [ ] Chaves secretas NÃO estão em VITE_* (apenas chaves públicas)
- [ ] CSP headers (via _headers file no GitHub Pages)
- [ ] HTTPS em produção (GitHub Pages força HTTPS)

**Conformidade:**
- [ ] Banner LGPD presente (LgpdBanner component do prompt 04)
- [ ] Link para Política de Privacidade no banner
- [ ] Termos de Uso linkado no registro

**Stripe/Pagamentos:**
- [ ] Checkout funciona em modo live
- [ ] Webhook recebe e processa eventos
- [ ] Customer Portal acessível
- [ ] E-mails de fatura habilitados no Stripe
```

---

## Arquivos Criados/Modificados

```
tests/
├── auth.spec.ts                          (CRIADO)
├── navigation.spec.ts                    (CRIADO)
└── map.spec.ts                           (CRIADO)
playwright.config.ts                      (CRIADO)
src/components/ui/
├── EmptyState.tsx                        (CRIADO)
├── AlertBadge.tsx                        (CRIADO)
└── NotificationBell.tsx                  (CRIADO)
index.html                                (ATUALIZADO — SEO completo)
public/
├── favicon.svg                           (CRIADO)
└── og-image.png                          (A CRIAR manualmente)
.github/workflows/test.yml                (CRIADO)
```

---

## Verificação

1. `npx playwright test tests/auth.spec.ts` → testes de auth passam sem usuário logado
2. Abrir Chrome DevTools → Lighthouse → Performance > 80
3. Compartilhar URL no WhatsApp/Slack → og:image aparece no preview
4. Abrir em mobile → MobileWarning aparece
5. `npm run build` → bundle principal < 500KB gzip

---

## Notas Técnicas

- **Playwright testes autenticados**: Testes que precisam de usuário logado devem usar `storageState` do Playwright para salvar e reutilizar sessão. Ver `playwright.config.ts` com `use.storageState`.
- **Lighthouse no CI**: Para CI, usar `@lhci/cli` (Lighthouse CI) no GitHub Actions para rodar audits automaticamente a cada push.
- **og:image**: O arquivo deve ter exatamente 1200×630px para preview perfeito no WhatsApp, Twitter e LinkedIn. Usar Figma ou Canva para criar.
- **CSP headers no GitHub Pages**: GitHub Pages não permite configurar headers customizados. Para CSP, usar Cloudflare Workers ou Vercel.
- **`_headers` file (alternativa ao CSP)**: Cloudflare Pages suporta arquivo `_headers` para configurar headers. Se migrar para Cloudflare Pages, adicionar:
  ```
  /*
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
  ```
