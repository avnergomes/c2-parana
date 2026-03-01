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
      async (_event, session) => {
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
