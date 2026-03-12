// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Ícones SVG inline para evitar dependência de lib de ícones
const icons: Record<string, JSX.Element> = {
  map: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
  clima: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>,
  agro: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  saude: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  ambiente: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  agua: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3c-1.5 3-6 7.5-6 11a6 6 0 1012 0c0-3.5-4.5-8-6-11z" /></svg>,
  noticias: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>,
  legislativo: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  chevron: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  lock: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
}

const NAV_ITEMS = [
  { path: '/mapa', label: 'Mapa Central', icon: 'map', plan: 'solo' },
  { path: '/clima', label: 'Clima', icon: 'clima', plan: 'solo' },
  { path: '/agronegocio', label: 'Agronegócio', icon: 'agro', plan: 'pro' },
  { path: '/saude', label: 'Saúde', icon: 'saude', plan: 'pro' },
  { path: '/ambiente', label: 'Meio Ambiente', icon: 'ambiente', plan: 'pro' },
  { path: '/agua', label: 'Recursos Hídricos', icon: 'agua', plan: 'pro' },
  { path: '/noticias', label: 'Notícias', icon: 'noticias', plan: 'solo' },
  { path: '/legislativo', label: 'Legislativo', icon: 'legislativo', plan: 'pro' },
] as const

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { isPro } = useAuth()

  return (
    <aside className={cn(
      'h-full bg-background-secondary border-r border-border flex flex-col transition-all duration-[120ms]',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'p-3 text-text-muted hover:text-text-primary transition-colors flex',
          collapsed ? 'justify-center' : 'justify-end'
        )}
      >
        <span className={cn('transition-transform duration-[120ms]', collapsed && 'rotate-180')}>
          {icons.chevron}
        </span>
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const locked = item.plan === 'pro' && !isPro
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all duration-[120ms] group relative',
                isActive
                  ? 'bg-accent-green/10 text-accent-green'
                  : 'text-text-secondary hover:bg-background-elevated hover:text-text-primary',
                collapsed ? 'justify-center' : '',
                locked && 'opacity-60'
              )}
            >
              <span className="flex-shrink-0">{icons[item.icon]}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium">{item.label}</span>
                  {locked && <span className="ml-auto text-text-muted">{icons.lock}</span>}
                </>
              )}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-background-elevated border border-border rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                  {item.label}{locked ? ' (Pro)' : ''}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-border">
          <p className="text-2xs text-text-muted text-center">C2 Paraná v1.0</p>
        </div>
      )}
    </aside>
  )
}
