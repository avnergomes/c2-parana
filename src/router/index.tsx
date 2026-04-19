// src/router/index.tsx
import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
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
const GetecPage = lazy(() => import('@/pages/GetecPage').then(m => ({ default: m.GetecPage })))
const SaudePage = lazy(() => import('@/pages/SaudePage').then(m => ({ default: m.SaudePage })))
const AmbientePage = lazy(() => import('@/pages/AmbientePage').then(m => ({ default: m.AmbientePage })))
const NoticiasPage = lazy(() => import('@/pages/NoticiasPage').then(m => ({ default: m.NoticiasPage })))
const LegislativoPage = lazy(() => import('@/pages/LegislativoPage').then(m => ({ default: m.LegislativoPage })))
const AguaPage = lazy(() => import('@/pages/AguaPage').then(m => ({ default: m.AguaPage })))
const AlertasPage = lazy(() => import('@/pages/AlertasPage').then(m => ({ default: m.AlertasPage })))
const NotificationPrefsPage = lazy(() => import('@/pages/NotificationPrefsPage').then(m => ({ default: m.NotificationPrefsPage })))
const RelatoriosPage = lazy(() => import('@/pages/RelatoriosPage').then(m => ({ default: m.RelatoriosPage })))
const TendenciasPage = lazy(() => import('@/pages/TendenciasPage').then(m => ({ default: m.TendenciasPage })))
const IncidentesPage = lazy(() => import('@/pages/IncidentesPage').then(m => ({ default: m.IncidentesPage })))
const IncidentDetailPage = lazy(() => import('@/pages/IncidentDetailPage').then(m => ({ default: m.IncidentDetailPage })))
const ComandoPage = lazy(() => import('@/pages/ComandoPage').then(m => ({ default: m.ComandoPage })))
const ReconhecimentoPage = lazy(() => import('@/pages/ReconhecimentoPage').then(m => ({ default: m.ReconhecimentoPage })))

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

        {/* Rotas privadas com Layout (paywall ativo) */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/clima" element={<ClimaPage />} />
          <Route path="/agronegocio" element={<AgroPage />} />
          <Route path="/getec" element={<GetecPage />} />
          <Route path="/saude" element={<SaudePage />} />
          <Route path="/ambiente" element={<AmbientePage />} />
          <Route path="/agua" element={<AguaPage />} />
          <Route path="/noticias" element={<NoticiasPage />} />
          <Route path="/legislativo" element={<LegislativoPage />} />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/tendencias" element={<TendenciasPage />} />
          <Route path="/incidentes" element={<IncidentesPage />} />
          <Route path="/incidentes/:id" element={<IncidentDetailPage />} />
          <Route path="/comando" element={<ComandoPage />} />
          <Route path="/reconhecimento" element={<ReconhecimentoPage />} />
          <Route path="/reconhecimento/:ibge" element={<ReconhecimentoPage />} />
          <Route path="/configuracoes/notificacoes" element={<NotificationPrefsPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
