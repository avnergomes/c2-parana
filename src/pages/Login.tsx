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
