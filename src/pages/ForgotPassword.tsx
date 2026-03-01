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
