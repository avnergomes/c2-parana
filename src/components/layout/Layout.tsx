// src/components/layout/Layout.tsx
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileWarning } from './MobileWarning'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LgpdBanner } from '@/components/ui/LgpdBanner'
import { useNoticiasRealtime } from '@/hooks/useNoticiasRealtime'
import { useNotificationsRealtime } from '@/hooks/useNotificationsRealtime'

export function Layout() {
  // Habilitar atualizacoes em tempo real de noticias e alertas
  useNoticiasRealtime()
  useNotificationsRealtime()

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <MobileWarning />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary moduleName="página">
            <Suspense fallback={<LoadingScreen />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <LgpdBanner />
    </div>
  )
}
