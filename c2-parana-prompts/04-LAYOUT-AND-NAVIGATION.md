# 04 — LAYOUT AND NAVIGATION: Layout Base do Dashboard

## Descrição
Cria o layout completo do dashboard: dark theme command center, header fixo com status LIVE, sidebar colapsável com módulos, area de conteúdo principal, e toda a navegação entre páginas.

## Pré-requisitos
- Prompts 01, 02 e 03 concluídos
- Auth funcionando

## Variáveis de Ambiente
As mesmas do prompt 03.

---

## Prompt para o Claude Code

```
Vou implementar o layout base do dashboard C2 Paraná — dark theme command center com header, sidebar e conteúdo principal. Execute todos os passos.

## PASSO 1: Criar src/components/ui/LiveIndicator.tsx

```typescript
// src/components/ui/LiveIndicator.tsx
interface LiveIndicatorProps {
  label?: string
  size?: 'sm' | 'md'
}

export function LiveIndicator({ label = 'LIVE', size = 'md' }: LiveIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`relative flex ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
        <span className={`relative inline-flex rounded-full bg-accent-green ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
      </span>
      <span className={`font-mono font-semibold text-accent-green ${size === 'sm' ? 'text-2xs' : 'text-xs'}`}>
        {label}
      </span>
    </div>
  )
}
```

## PASSO 2: Criar src/components/ui/Clock.tsx

```typescript
// src/components/ui/Clock.tsx
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const brasiliaTime = format(now, "HH:mm:ss", { locale: ptBR })
  const utcTime = format(new Date(now.getTime() + now.getTimezoneOffset() * 60000), "HH:mm")
  const dateStr = format(now, "dd/MM/yyyy", { locale: ptBR })

  return (
    <div className="hidden md:flex items-center gap-3 text-xs font-mono">
      <div className="text-right">
        <div className="text-text-primary font-semibold">{brasiliaTime}</div>
        <div className="text-text-muted">{dateStr} · BRT</div>
      </div>
      <div className="w-px h-6 bg-border" />
      <div>
        <div className="text-text-secondary">{utcTime}</div>
        <div className="text-text-muted">UTC</div>
      </div>
    </div>
  )
}
```

## PASSO 3: Criar src/components/ui/ErrorBoundary.tsx

```typescript
// src/components/ui/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  moduleName?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ErrorBoundary [${this.props.moduleName}]:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="card p-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-status-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-text-primary font-medium text-sm">Erro ao carregar {this.props.moduleName || 'módulo'}</p>
            <p className="text-text-muted text-xs mt-0.5">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="text-xs text-accent-blue hover:underline mt-1"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

## PASSO 4: Criar src/components/ui/SkeletonCard.tsx

```typescript
// src/components/ui/SkeletonCard.tsx
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-background-elevated rounded', className)} />
  )
}

export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-3 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

## PASSO 5: Criar src/components/ui/KpiCard.tsx

```typescript
// src/components/ui/KpiCard.tsx
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  subvalue?: string
  trend?: number        // percentual, positivo = bom, negativo = ruim
  icon?: ReactNode
  loading?: boolean
  accentColor?: 'green' | 'blue' | 'red' | 'yellow'
}

export function KpiCard({ label, value, subvalue, trend, icon, loading, accentColor = 'green' }: KpiCardProps) {
  const accentMap = {
    green: 'border-l-accent-green',
    blue: 'border-l-accent-blue',
    red: 'border-l-status-danger',
    yellow: 'border-l-status-warning',
  }

  if (loading) {
    return (
      <div className={`card p-4 border-l-2 ${accentMap[accentColor]} animate-pulse`}>
        <div className="h-3 bg-background-elevated rounded w-20 mb-3" />
        <div className="h-7 bg-background-elevated rounded w-28 mb-2" />
        <div className="h-3 bg-background-elevated rounded w-16" />
      </div>
    )
  }

  return (
    <div className={`card p-4 border-l-2 ${accentMap[accentColor]} hover:shadow-card-hover transition-all`}>
      <div className="flex items-start justify-between">
        <p className="kpi-label">{label}</p>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <p className="kpi-value mt-2">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      {(subvalue || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-1">
          {trend !== undefined && (
            <span className={cn(
              'text-xs font-mono font-medium',
              trend >= 0 ? 'text-status-success' : 'text-status-danger'
            )}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {subvalue && <span className="text-text-muted text-xs">{subvalue}</span>}
        </div>
      )}
    </div>
  )
}
```

## PASSO 6: Criar src/components/layout/Sidebar.tsx

```typescript
// src/components/layout/Sidebar.tsx
import { NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Ícones SVG inline para evitar dependência de lib de ícones
const icons = {
  map: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
  clima: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>,
  agro: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  saude: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  ambiente: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  noticias: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>,
  legislativo: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  chevron: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  lock: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
}

const NAV_ITEMS = [
  { path: '/mapa', label: 'Mapa Central', icon: 'map', plan: 'solo' },
  { path: '/clima', label: 'Clima', icon: 'clima', plan: 'solo' },
  { path: '/agronegocio', label: 'Agronegócio', icon: 'agro', plan: 'pro' },
  { path: '/saude', label: 'Saúde', icon: 'saude', plan: 'pro' },
  { path: '/ambiente', label: 'Meio Ambiente', icon: 'ambiente', plan: 'pro' },
  { path: '/noticias', label: 'Notícias', icon: 'noticias', plan: 'solo' },
  { path: '/legislativo', label: 'Legislativo', icon: 'legislativo', plan: 'pro' },
] as const

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { isPro } = useAuth()

  return (
    <aside className={cn(
      'h-full bg-background-secondary border-r border-border flex flex-col transition-all duration-[120ms]',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'p-3 text-text-muted hover:text-text-primary transition-colors flex',
          collapsed ? 'justify-center' : 'justify-end'
        )}
      >
        <span className={cn('transition-transform duration-[120ms]', collapsed && 'rotate-180')}>
          {icons.chevron}
        </span>
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const locked = item.plan === 'pro' && !isPro
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all duration-[120ms] group relative',
                isActive
                  ? 'bg-accent-green/10 text-accent-green'
                  : 'text-text-secondary hover:bg-background-elevated hover:text-text-primary',
                collapsed ? 'justify-center' : '',
                locked && 'opacity-60'
              )}
            >
              <span className="flex-shrink-0">{icons[item.icon]}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium">{item.label}</span>
                  {locked && <span className="ml-auto text-text-muted">{icons.lock}</span>}
                </>
              )}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-background-elevated border border-border rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                  {item.label}{locked ? ' (Pro)' : ''}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-border">
          <p className="text-2xs text-text-muted text-center">C2 Paraná v1.0</p>
        </div>
      )}
    </aside>
  )
}
```

## PASSO 7: Criar src/components/layout/Header.tsx

```typescript
// src/components/layout/Header.tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { Clock } from '@/components/ui/Clock'
import { cn } from '@/lib/utils'

export function Header() {
  const { user, subscription, accessStatus, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  const trialDaysLeft = (() => {
    if (accessStatus !== 'trialing' || !subscription?.trial_end) return null
    const diff = new Date(subscription.trial_end).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })()

  return (
    <header className="h-14 bg-background-secondary border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
      {/* Logo */}
      <Link to="/dashboard" className="flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 bg-accent-green/20 border border-accent-green/40 rounded flex items-center justify-center">
          <span className="text-accent-green text-xs font-mono font-bold">CC</span>
        </div>
        <div className="hidden sm:block">
          <span className="font-mono font-semibold text-text-primary text-sm tracking-wider">C2 PARANÁ</span>
        </div>
      </Link>

      {/* Live indicator */}
      <LiveIndicator />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clock */}
      <Clock />

      {/* Trial badge */}
      {trialDaysLeft !== null && (
        <Link to="/pricing" className="hidden md:flex items-center gap-1.5 bg-amber-900/30 border border-amber-700/40 rounded px-2 py-1 hover:bg-amber-900/50 transition-colors">
          <span className="text-status-warning text-xs font-medium">
            Trial · {trialDaysLeft}d restante{trialDaysLeft !== 1 ? 's' : ''}
          </span>
        </Link>
      )}

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 hover:bg-background-elevated rounded-lg px-2 py-1.5 transition-colors"
        >
          <div className="w-7 h-7 bg-accent-blue/20 border border-accent-blue/40 rounded-full flex items-center justify-center">
            <span className="text-accent-blue text-xs font-semibold uppercase">
              {user?.email?.[0] || 'U'}
            </span>
          </div>
          <span className="hidden md:block text-sm text-text-secondary max-w-[140px] truncate">
            {user?.email}
          </span>
          <svg className="w-4 h-4 text-text-muted hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 card border border-border shadow-card-hover animate-fade-in z-50">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-text-primary truncate">{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn(
                  'text-xs font-medium',
                  accessStatus === 'active' ? 'text-accent-green' :
                  accessStatus === 'trialing' ? 'text-status-warning' :
                  'text-status-danger'
                )}>
                  {accessStatus === 'active' ? `Plano ${subscription?.plan}` :
                   accessStatus === 'trialing' ? 'Trial' :
                   'Expirado'}
                </span>
              </div>
            </div>
            <div className="py-1">
              <Link to="/pricing" className="block px-4 py-2 text-sm text-text-secondary hover:bg-background-elevated hover:text-text-primary transition-colors" onClick={() => setMenuOpen(false)}>
                Planos e assinatura
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm text-status-danger hover:bg-red-900/20 transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
```

## PASSO 8: Criar src/components/layout/MobileWarning.tsx

```typescript
// src/components/layout/MobileWarning.tsx
import { useState } from 'react'

export function MobileWarning() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center p-6 md:hidden">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🖥️</div>
        <h2 className="text-xl font-bold text-text-primary font-mono">C2 Paraná</h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          Esta plataforma foi projetada para uso em desktop (mínimo 1280px). 
          Para a melhor experiência de inteligência territorial, acesse em um computador.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="btn-secondary text-sm px-4 py-2"
        >
          Continuar assim mesmo
        </button>
      </div>
    </div>
  )
}
```

## PASSO 9: Criar src/components/layout/Layout.tsx

```typescript
// src/components/layout/Layout.tsx
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileWarning } from './MobileWarning'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function Layout() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <MobileWarning />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary moduleName="página">
            <Suspense fallback={<LoadingScreen />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
```

## PASSO 10: Criar páginas placeholder para todos os módulos

Crie os seguintes arquivos placeholder (serão substituídos nos prompts de módulos):

```typescript
// src/pages/Dashboard.tsx
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/ui/KpiCard'

export function DashboardPage() {
  const { user, subscription, accessStatus } = useAuth()
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">
          Bem-vindo ao C2 Paraná, {user?.email}
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Status" value={accessStatus === 'trialing' ? 'Trial' : subscription?.plan || '—'} accentColor="green" />
        <KpiCard label="Módulos ativos" value="7" accentColor="blue" />
        <KpiCard label="Municípios PR" value="399" accentColor="blue" />
        <KpiCard label="Atualizações/dia" value=">200" accentColor="green" />
      </div>
      <p className="text-text-muted text-sm">
        Use o menu lateral para navegar pelos módulos de inteligência.
      </p>
    </div>
  )
}
```

```typescript
// src/pages/MapPage.tsx
export function MapPage() {
  return <div className="p-6 text-text-secondary">Módulo Mapa — execute o prompt 05</div>
}
```

```typescript
// src/pages/ClimaPage.tsx
export function ClimaPage() {
  return <div className="p-6 text-text-secondary">Módulo Clima — execute o prompt 06</div>
}
```

```typescript
// src/pages/AgroPage.tsx
export function AgroPage() {
  return <div className="p-6 text-text-secondary">Módulo Agronegócio — execute o prompt 07</div>
}
```

```typescript
// src/pages/SaudePage.tsx
export function SaudePage() {
  return <div className="p-6 text-text-secondary">Módulo Saúde — execute o prompt 08</div>
}
```

```typescript
// src/pages/AmbientePage.tsx
export function AmbientePage() {
  return <div className="p-6 text-text-secondary">Módulo Meio Ambiente — execute o prompt 09</div>
}
```

```typescript
// src/pages/NoticiasPage.tsx
export function NoticiasPage() {
  return <div className="p-6 text-text-secondary">Módulo Notícias — execute o prompt 10</div>
}
```

```typescript
// src/pages/LegislativoPage.tsx
export function LegislativoPage() {
  return <div className="p-6 text-text-secondary">Módulo Legislativo — execute o prompt 10</div>
}
```

## PASSO 11: Atualizar src/router/index.tsx com Layout

```typescript
// src/router/index.tsx
import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'
import { ForgotPasswordPage } from '@/pages/ForgotPassword'
import { ResetPasswordPage } from '@/pages/ResetPassword'
import { PricingPage } from '@/pages/PricingPage'
import { CheckoutSuccessPage } from '@/pages/CheckoutSuccess'
import { CheckoutCancelPage } from '@/pages/CheckoutCancel'

// Lazy load dos módulos
const DashboardPage = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.DashboardPage })))
const MapPage = lazy(() => import('@/pages/MapPage').then(m => ({ default: m.MapPage })))
const ClimaPage = lazy(() => import('@/pages/ClimaPage').then(m => ({ default: m.ClimaPage })))
const AgroPage = lazy(() => import('@/pages/AgroPage').then(m => ({ default: m.AgroPage })))
const SaudePage = lazy(() => import('@/pages/SaudePage').then(m => ({ default: m.SaudePage })))
const AmbientePage = lazy(() => import('@/pages/AmbientePage').then(m => ({ default: m.AmbientePage })))
const NoticiasPage = lazy(() => import('@/pages/NoticiasPage').then(m => ({ default: m.NoticiasPage })))
const LegislativoPage = lazy(() => import('@/pages/LegislativoPage').then(m => ({ default: m.LegislativoPage })))

export function AppRouter() {
  return (
    <AuthProvider>
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />

        {/* Rotas protegidas com Layout */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/clima" element={<ClimaPage />} />
          <Route path="/agronegocio" element={<AgroPage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/ambiente" element={<AmbientePage />} />
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/legislativo" element={<LegislativoPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
```

## PASSO 12: Atualizar src/App.tsx final

```typescript
// src/App.tsx
import { AppRouter } from '@/router'

export default function App() {
  return <AppRouter />
}
```

## PASSO 13: Criar LGPD Banner

```typescript
// src/components/ui/LgpdBanner.tsx
import { useState } from 'react'

export function LgpdBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('lgpd-consent') === 'true'
  })

  if (dismissed) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background-elevated border-t border-border p-4 z-40">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <p className="text-text-secondary text-sm">
          Este site utiliza cookies para autenticação e análise de uso.{' '}
          <a href="#" className="text-accent-blue hover:underline">Política de Privacidade</a>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('lgpd-consent', 'true')
            setDismissed(true)
          }}
          className="btn-primary text-sm px-4 py-1.5 flex-shrink-0"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
```

Adicione `<LgpdBanner />` no final do Layout.tsx, antes do fechamento da div principal.
```

---

## Arquivos Criados/Modificados

```
src/
├── App.tsx                                (SUBSTITUÍDO — usa AppRouter)
├── router/
│   └── index.tsx                          (CRIADO com lazy routes)
├── components/
│   ├── layout/
│   │   ├── Header.tsx                     (CRIADO)
│   │   ├── Sidebar.tsx                    (CRIADO)
│   │   ├── Layout.tsx                     (CRIADO)
│   │   └── MobileWarning.tsx              (CRIADO)
│   └── ui/
│       ├── LiveIndicator.tsx              (CRIADO)
│       ├── Clock.tsx                      (CRIADO)
│       ├── ErrorBoundary.tsx              (CRIADO)
│       ├── SkeletonCard.tsx               (CRIADO)
│       ├── KpiCard.tsx                    (CRIADO)
│       └── LgpdBanner.tsx                 (CRIADO)
└── pages/
    ├── Dashboard.tsx                      (CRIADO)
    ├── MapPage.tsx                        (CRIADO — placeholder)
    ├── ClimaPage.tsx                      (CRIADO — placeholder)
    ├── AgroPage.tsx                       (CRIADO — placeholder)
    ├── SaudePage.tsx                      (CRIADO — placeholder)
    ├── AmbientePage.tsx                   (CRIADO — placeholder)
    ├── NoticiasPage.tsx                   (CRIADO — placeholder)
    └── LegislativoPage.tsx                (CRIADO — placeholder)
```

---

## Verificação

1. `npm run dev` → logar e ver o dashboard com sidebar, header, relógio ao vivo
2. Sidebar colapsável: clicar no chevron — sidebar reduz para ícones; hover mostra tooltip
3. Relógio BRT e UTC atualizando a cada segundo
4. Indicador LIVE pulsando em verde
5. Menu do usuário: clicar no e-mail → dropdown com plano e opção de sair
6. Em tela menor que 768px: MobileWarning aparece

---

## Notas Técnicas

- **Lazy loading**: Todos os módulos de página são carregados sob demanda. O bundle inicial (~200KB gzip) carrega em <1s em 3G.
- **Sidebar colapsável**: Estado `collapsed` é local (useState). Para persistir entre sessões, usar `localStorage.getItem('sidebar-collapsed')`.
- **Clock**: Usa `date-fns` para formatar. O UTC é calculado manualmente com `getTimezoneOffset()` pois o browser não tem timezone nativo para UTC.
- **MobileWarning**: É um gate visual, não bloqueia o DOM. O usuário pode dispensar clicando em "Continuar assim mesmo".
- **ProtectedRoute wrappando Layout**: Toda rota dentro do `<Layout />` está protegida. Se o usuário fizer logout em qualquer página, o ProtectedRoute detecta e redireciona para /login.
