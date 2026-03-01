// src/hooks/useCheckout.ts
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { callEdgeFunction } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

export function useCheckout() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  const startCheckout = async (plan: 'solo' | 'pro') => {
    if (!user) {
      navigate('/login')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { url } = await callEdgeFunction<{ url: string }>('create-checkout', {
        plan,
        success_url: `${window.location.origin}/checkout/success`,
        cancel_url: `${window.location.origin}/pricing`,
      })

      if (url) {
        window.location.href = url
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao iniciar checkout'
      setError(errorMessage)
      console.error('Checkout error:', err)
    } finally {
      setLoading(false)
    }
  }

  const openPortal = async () => {
    setLoading(true)
    setError(null)

    try {
      const { url } = await callEdgeFunction<{ url: string }>('create-portal', {
        return_url: window.location.href,
      })

      if (url) {
        window.open(url, '_blank')
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao abrir portal'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return { startCheckout, openPortal, loading, error }
}
