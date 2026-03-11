// src/router/index.tsx
import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
// TODO: Reativar ProtectedRoute quando auth estiver configurado
// import { ProtectedRoute } from './ProtectedRoute'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'
import { ForgotPasswordPage } from '@/pages/ForgotPassword'
import { ResetPasswordPage } from '@/pages/ResetPassword'
import { PricingPage } from '@/pages/PricingPage'
import { CheckoutSuccessPage } from '@/pages/CheckoutSuccess'
import { CheckoutCancelPage } from '@/pages/CheckoutCancel'
import { AuthCallbackPage } from '@/pages/AuthCallback'

// Lazy load dos módulos
const DashboardPage = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.DashboardPage })))
const MapPage = lazy(() => import('@/pages/MapPage').then(m => ({ default: m.MapPage })))
const ClimaPage = lazy(() => import('@/pages/ClimaPage').then(m => ({ default: m.ClimaPage })))
const AgroPage = lazy(() => import('@/pages/AgroPage').then(m => ({ default: m.AgroPage })))
const SaudePage = lazy(() => import('@/pages/SaudePage').then(m => ({ default: m.SaudePage })))
const AmbientePage = lazy(() => import('@/pages/AmbientePage').then(m => ({ default: m.AmbientePage })))
const NoticiasPage = lazy(() => import('@/pages/NoticiasPage').then(m => ({ default: m.NoticiasPage })))
const LegislativoPage = lazy(() => import('@/pages/LegislativoPage').then(m => ({ default: m.LegislativoPage })))

export function AppRouter() {
  return (
    <AuthProvider>
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />

        {/* Rotas com Layout (auth desabilitado temporariamente para testes) */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/clima" element={<ClimaPage />} />
          <Route path="/agronegocio" element={<AgroPage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/ambiente" element={<AmbientePage />} />
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/legislativo" element={<LegislativoPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
