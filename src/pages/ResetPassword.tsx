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
