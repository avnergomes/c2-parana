// src/router/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

interface ProtectedRouteProps {
  children: React.ReactNode
  requirePro?: boolean
}

export function ProtectedRoute({ children, requirePro = false }: ProtectedRouteProps) {
  const { loading, accessStatus, user, hasAccess, isPro } = useAuth()
  const location = useLocation()

  // Aguarda tanto o bootstrap inicial (loading) quanto refetches intermediarios
  // (accessStatus === 'loading'). Sem isso, TOKEN_REFRESHED em sessoes longas
  // derrubava hasAccess temporariamente e jogava o usuario para /pricing.
  if (loading || accessStatus === 'loading') return <LoadingScreen />

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
