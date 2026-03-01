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
