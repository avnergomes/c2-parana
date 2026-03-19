// src/components/layout/Header.tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCheckout } from '@/hooks/useCheckout'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { Clock } from '@/components/ui/Clock'
import { ClimaWidget } from '@/components/clima/ClimaWidget'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { cn } from '@/lib/utils'

export function Header() {
  const { user, subscription, accessStatus, signOut } = useAuth()
  const { openPortal, loading: portalLoading } = useCheckout()
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

      {/* Clima Widget */}
      <ClimaWidget />

      {/* Clock */}
      <Clock />

      {/* Notifications */}
      <NotificationBell />

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
              {subscription?.stripe_subscription_id && (
                <button
                  onClick={() => { openPortal(); setMenuOpen(false) }}
                  disabled={portalLoading}
                  className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-background-elevated hover:text-text-primary transition-colors"
                >
                  {portalLoading ? 'Carregando...' : 'Gerenciar assinatura'}
                </button>
              )}
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
