# 03 — AUTH AND PAYWALL: Autenticação + Trial + Stripe Checkout

## Descrição
Implementa o sistema completo de autenticação (email/senha + Google OAuth), contexto de auth, proteção de rotas, verificação de trial, paywall modal e integração com Stripe Checkout.

## Pré-requisitos
- Prompts 01 e 02 concluídos
- Projeto Supabase configurado com Auth habilitado
- Google OAuth configurado no Supabase (opcional para MVP inicial)
- `.env.local` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Prompt para o Claude Code

```
Vou implementar o sistema completo de autenticação e paywall do C2 Paraná. Execute os passos na ordem.

## PASSO 1: Criar src/contexts/AuthContext.tsx

```typescript
// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Subscription } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  subscription: Subscription | null
  loading: boolean
  accessStatus: 'loading' | 'trialing' | 'active' | 'expired' | 'canceled' | 'past_due' | 'none'
  hasAccess: boolean
  isPro: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  refreshSubscription: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscription = async (userId: string) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!error && data) {
      setSubscription(data as Subscription)
    }
  }

  useEffect(() => {
    // Pegar sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchSubscription(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Ouvir mudanças de auth
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchSubscription(session.user.id)
        } else {
          setSubscription(null)
        }
        setLoading(false)
      }
    )

    return () => authListener.unsubscribe()
  }, [])

  const accessStatus = React.useMemo((): AuthContextType['accessStatus'] => {
    if (loading) return 'loading'
    if (!subscription) return 'none'

    const { status, trial_end } = subscription

    if (status === 'trialing') {
      if (!trial_end) return 'expired'
      return new Date(trial_end) > new Date() ? 'trialing' : 'expired'
    }

    return status as AuthContextType['accessStatus']
  }, [subscription, loading])

  const hasAccess = accessStatus === 'trialing' || accessStatus === 'active'
  const isPro = hasAccess && (subscription?.plan === 'pro' || subscription?.plan === 'enterprise' || accessStatus === 'trialing')

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error: error as Error | null }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSubscription(null)
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { error: error as Error | null }
  }

  const refreshSubscription = async () => {
    if (user) await fetchSubscription(user.id)
  }

  return (
    <AuthContext.Provider value={{
      user, session, subscription, loading,
      accessStatus, hasAccess, isPro,
      signIn, signUp, signInWithGoogle, signOut,
      resetPassword, refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
```

## PASSO 2: Criar src/hooks/useAuth.ts

```typescript
// src/hooks/useAuth.ts
// Re-export para facilitar imports
export { useAuth } from '@/contexts/AuthContext'
```

## PASSO 3: Criar src/router/ProtectedRoute.tsx

```typescript
// src/router/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

interface ProtectedRouteProps {
  children: React.ReactNode
  requirePro?: boolean
}

export function ProtectedRoute({ children, requirePro = false }: ProtectedRouteProps) {
  const { loading, hasAccess, isPro, user } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!hasAccess) {
    return <Navigate to="/pricing" state={{ from: location, expired: true }} replace />
  }

  if (requirePro && !isPro) {
    return <Navigate to="/pricing" state={{ from: location, upgrade: true }} replace />
  }

  return <>{children}</>
}
```

## PASSO 4: Criar src/components/ui/LoadingScreen.tsx

```typescript
// src/components/ui/LoadingScreen.tsx
export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-accent-green border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-text-secondary text-sm font-mono">Carregando C2 Paraná...</p>
      </div>
    </div>
  )
}
```

## PASSO 5: Criar src/pages/Login.tsx

```typescript
// src/pages/Login.tsx
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos'
        : error.message)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-mono text-accent-green tracking-wider">
            C2 PARANÁ
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Command & Control · Inteligência Territorial
          </p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-text-primary mb-6">Entrar na plataforma</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-status-danger text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="seu@email.com"
                required
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-text-secondary">Senha</label>
                <Link to="/forgot-password" className="text-xs text-accent-blue hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" disabled={loading} className={cn('btn-primary w-full', loading && 'opacity-60 cursor-not-allowed')}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background-card px-3 text-text-muted">ou continue com</span>
            </div>
          </div>

          <button
            onClick={signInWithGoogle}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>

        <p className="text-center text-text-secondary text-sm mt-6">
          Não tem conta?{' '}
          <Link to="/register" className="text-accent-green hover:underline font-medium">
            Teste grátis por 14 dias
          </Link>
        </p>
      </div>
    </div>
  )
}
```

## PASSO 6: Criar src/pages/Register.tsx

```typescript
// src/pages/Register.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres')
      return
    }

    setLoading(true)
    const { error } = await signUp(email, password, fullName)
    setLoading(false)

    if (error) {
      setError(error.message.includes('already registered')
        ? 'Este e-mail já está cadastrado. Faça login.'
        : error.message)
      return
    }

    setSuccess(true)
    setTimeout(() => navigate('/login'), 3000)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-accent-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Conta criada!</h2>
          <p className="text-text-secondary text-sm">
            Verifique seu e-mail para confirmar o cadastro. Redirecionando para o login...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-mono text-accent-green tracking-wider">C2 PARANÁ</h1>
          <p className="text-text-secondary text-sm mt-1">Trial gratuito de 14 dias · Sem cartão de crédito</p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-text-primary mb-6">Criar conta</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-status-danger text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">Nome completo</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" placeholder="João Silva" required />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Mínimo 8 caracteres" required minLength={8} />
            </div>

            <button type="submit" disabled={loading} className={cn('btn-primary w-full', loading && 'opacity-60 cursor-not-allowed')}>
              {loading ? 'Criando conta...' : 'Criar conta e começar trial'}
            </button>
          </form>

          <p className="text-xs text-text-muted text-center mt-4">
            Ao criar sua conta, você concorda com os{' '}
            <a href="#" className="text-accent-blue hover:underline">Termos de Uso</a>
          </p>
        </div>

        <p className="text-center text-text-secondary text-sm mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-accent-green hover:underline font-medium">Fazer login</Link>
        </p>
      </div>
    </div>
  )
}
```

## PASSO 7: Criar src/pages/ForgotPassword.tsx e ResetPassword.tsx

```typescript
// src/pages/ForgotPassword.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const { resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await resetPassword(email)
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-mono text-accent-green">C2 PARANÁ</h1>
        </div>
        <div className="card p-8">
          <h2 className="text-xl font-semibold mb-6">Recuperar senha</h2>
          {sent ? (
            <div className="text-center py-4">
              <p className="text-text-secondary">Se o e-mail existir em nossa base, você receberá um link para redefinir sua senha.</p>
              <Link to="/login" className="btn-primary inline-block mt-4">Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="seu@email.com" required />
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
              <Link to="/login" className="block text-center text-sm text-text-secondary hover:text-text-primary">Voltar ao login</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

```typescript
// src/pages/ResetPassword.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <h2 className="text-xl font-semibold mb-6">Nova senha</h2>
          {error && <p className="text-status-danger text-sm mb-4">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Nova senha (mínimo 8 caracteres)" required minLength={8} />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Salvando...' : 'Definir nova senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

## PASSO 8: Criar src/pages/PricingPage.tsx

```typescript
// src/pages/PricingPage.tsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { callEdgeFunction } from '@/lib/supabase'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: 49,
    description: 'Para profissionais individuais',
    features: [
      'Mapa central básico',
      'Módulo Clima completo',
      'Feed de Notícias',
      'Alertas INMET',
      'Atualizações em tempo real',
    ],
    unavailable: ['Agronegócio', 'Saúde', 'Meio Ambiente', 'Acesso à API'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    description: 'Para equipes e empresas',
    highlight: true,
    features: [
      'Tudo do Solo',
      'Agronegócio completo (VBP, Preços, ComexStat)',
      'Saúde (InfoDengue, leitos)',
      'Meio Ambiente (FIRMS, ANA, AQICN)',
      'Legislativo (ALEP)',
      'Alertas push por e-mail',
      'Acesso à API (em breve)',
    ],
    unavailable: [],
  },
]

export function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const { user, accessStatus } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isExpired = (location.state as any)?.expired

  const handleCheckout = async (planId: string) => {
    if (!user) { navigate('/login'); return }
    setLoadingPlan(planId)

    try {
      const { url } = await callEdgeFunction<{ url: string }>('create-checkout', {
        plan: planId,
        success_url: `${window.location.origin}/checkout/success`,
        cancel_url: `${window.location.origin}/pricing`,
      })

      if (url) window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Erro ao iniciar checkout. Tente novamente.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-text-primary mb-3">Planos C2 Paraná</h1>
          {isExpired && (
            <div className="inline-block bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-2 mb-4">
              <p className="text-status-warning text-sm">Seu trial de 14 dias expirou. Escolha um plano para continuar.</p>
            </div>
          )}
          <p className="text-text-secondary">Acesse inteligência territorial do Paraná em tempo real</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {PLANS.map(plan => (
            <div key={plan.id} className={`card p-6 flex flex-col ${plan.highlight ? 'border-accent-green shadow-glow' : ''}`}>
              {plan.highlight && (
                <span className="badge-success self-start mb-3">Mais popular</span>
              )}
              <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
              <p className="text-text-secondary text-sm mt-1">{plan.description}</p>
              <div className="mt-4 mb-6">
                <span className="text-4xl font-bold font-mono text-text-primary">R${plan.price}</span>
                <span className="text-text-secondary">/mês</span>
              </div>

              <ul className="space-y-2 flex-grow">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                    <span className="text-accent-green">✓</span> {f}
                  </li>
                ))}
                {plan.unavailable.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="text-text-muted">✗</span> {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan === plan.id}
                className={`mt-6 w-full ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}
              >
                {loadingPlan === plan.id ? 'Aguarde...' : `Assinar ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 text-text-muted text-sm">
          <p>Enterprise com dados customizados e SLA?{' '}
            <a href="mailto:contato@ccparana.com.br" className="text-accent-blue hover:underline">Fale conosco</a>
          </p>
        </div>
      </div>
    </div>
  )
}
```

## PASSO 9: Criar src/components/ui/PaywallModal.tsx

```typescript
// src/components/ui/PaywallModal.tsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface PaywallModalProps {
  feature: string
  requiredPlan?: 'pro' | 'enterprise'
  onClose: () => void
}

export function PaywallModal({ feature, requiredPlan = 'pro', onClose }: PaywallModalProps) {
  const navigate = useNavigate()
  const { accessStatus } = useAuth()

  const isExpired = accessStatus === 'expired' || accessStatus === 'canceled'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-8 text-center animate-fade-in">
        <div className="w-14 h-14 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-text-primary mb-2">
          {isExpired ? 'Trial expirado' : `Plano ${requiredPlan === 'pro' ? 'Pro' : 'Enterprise'} necessário`}
        </h3>
        <p className="text-text-secondary text-sm mb-6">
          {isExpired
            ? 'Seu período de trial terminou. Assine para continuar acessando o C2 Paraná.'
            : `O módulo "${feature}" está disponível no plano Pro ou superior.`}
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Fechar</button>
          <button onClick={() => navigate('/pricing')} className="btn-primary flex-1">
            {isExpired ? 'Escolher plano' : 'Fazer upgrade'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

## PASSO 10: Criar src/pages/CheckoutSuccess.tsx e CheckoutCancel.tsx

```typescript
// src/pages/CheckoutSuccess.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function CheckoutSuccessPage() {
  const navigate = useNavigate()
  const { refreshSubscription } = useAuth()

  useEffect(() => {
    refreshSubscription()
    const timer = setTimeout(() => navigate('/dashboard'), 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-10 max-w-md text-center">
        <div className="w-16 h-16 bg-accent-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Assinatura ativada!</h2>
        <p className="text-text-secondary text-sm">Bem-vindo ao C2 Paraná. Redirecionando para o dashboard...</p>
      </div>
    </div>
  )
}
```

```typescript
// src/pages/CheckoutCancel.tsx
import { useNavigate } from 'react-router-dom'

export function CheckoutCancelPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-10 max-w-md text-center">
        <h2 className="text-xl font-bold text-text-primary mb-2">Checkout cancelado</h2>
        <p className="text-text-secondary text-sm mb-6">Você cancelou o processo de assinatura. Pode tentar novamente quando quiser.</p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/dashboard')} className="btn-secondary flex-1">Voltar ao dashboard</button>
          <button onClick={() => navigate('/pricing')} className="btn-primary flex-1">Ver planos</button>
        </div>
      </div>
    </div>
  )
}
```

## PASSO 11: Atualizar src/App.tsx com rotas

```typescript
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'
import { ForgotPasswordPage } from '@/pages/ForgotPassword'
import { ResetPasswordPage } from '@/pages/ResetPassword'
import { PricingPage } from '@/pages/PricingPage'
import { CheckoutSuccessPage } from '@/pages/CheckoutSuccess'
import { CheckoutCancelPage } from '@/pages/CheckoutCancel'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
// Layout será adicionado no prompt 04
// import { Layout } from '@/components/layout/Layout'

function PlaceholderDashboard() {
  return <div className="min-h-screen bg-background flex items-center justify-center text-accent-green font-mono">Dashboard — execute o prompt 04</div>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Públicas */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />

        {/* Protegidas */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <PlaceholderDashboard />
          </ProtectedRoute>
        } />

        {/* Redirect raiz */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
```
```

---

## Arquivos Criados/Modificados

```
src/
├── App.tsx                                (SUBSTITUÍDO — com rotas)
├── contexts/
│   └── AuthContext.tsx                    (CRIADO)
├── hooks/
│   └── useAuth.ts                         (CRIADO)
├── router/
│   └── ProtectedRoute.tsx                 (CRIADO)
├── components/ui/
│   ├── LoadingScreen.tsx                  (CRIADO)
│   └── PaywallModal.tsx                   (CRIADO)
└── pages/
    ├── Login.tsx                          (CRIADO)
    ├── Register.tsx                       (CRIADO)
    ├── ForgotPassword.tsx                 (CRIADO)
    ├── ResetPassword.tsx                  (CRIADO)
    ├── PricingPage.tsx                    (CRIADO)
    ├── CheckoutSuccess.tsx                (CRIADO)
    └── CheckoutCancel.tsx                 (CRIADO)
```

---

## Verificação

1. `npm run dev` → navegar para `http://localhost:3000/login` → ver tela de login dark
2. Criar conta em `/register` → verificar e-mail de confirmação chega
3. Após confirmar e-mail, logar em `/login` → redireciona para `/dashboard`
4. Logout e acessar `/dashboard` → redireciona para `/login`
5. `/pricing` exibe cards com planos Solo e Pro

---

## Notas Técnicas

- **Trial acesso Pro completo**: `handle_new_subscription()` cria trial com plano `pro` — usuário vê todos os módulos durante o trial, maximizando conversão.
- **accessStatus derivado do banco**: O status é calculado do `subscriptions.trial_end` e `subscriptions.status`. Se o cron do Stripe não atualizar (ex: webhook perdido), o usuário ainda é bloqueado corretamente pelo `trial_end`.
- **Confirmação de e-mail**: Com `Confirm email` ativado no Supabase, o usuário recebe e-mail antes de conseguir logar. Para MVP rápido, desativar temporariamente em Authentication → Settings → Disable email confirmations.
- **Google OAuth redirect**: O redirect `${window.location.origin}/auth/callback` deve estar cadastrado no Supabase Dashboard → Auth → Redirect URLs.
