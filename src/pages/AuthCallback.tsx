// src/pages/AuthCallback.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase processa o hash fragment automaticamente quando detectSessionInUrl=true
    // Precisamos apenas aguardar a sessão ser processada e redirecionar
    const handleCallback = async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession()

        if (authError) {
          console.error('Auth callback error:', authError)
          setError(authError.message)
          setTimeout(() => navigate('/login'), 3000)
          return
        }

        if (session) {
          // Usuário autenticado com sucesso
          navigate('/dashboard', { replace: true })
        } else {
          // Sem sessão - pode ser confirmação de email sem auto-login
          navigate('/login', { replace: true })
        }
      } catch (err) {
        console.error('Auth callback unexpected error:', err)
        setError('Erro inesperado na autenticação')
        setTimeout(() => navigate('/login'), 3000)
      }
    }

    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-status-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Erro na autenticação</h2>
          <p className="text-text-secondary text-sm">{error}</p>
          <p className="text-text-muted text-xs mt-2">Redirecionando para o login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-8 max-w-md text-center">
        <div className="w-8 h-8 border-2 border-accent-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary text-sm">Autenticando...</p>
      </div>
    </div>
  )
}
