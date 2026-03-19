// src/components/ui/NotificationBell.tsx
import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useUnreadCount, useNotifications, useMarkAsRead } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-status-danger',
  high: 'bg-orange-500',
  medium: 'bg-status-warning',
  low: 'bg-accent-green',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'text-status-danger',
  high: 'text-orange-500',
  medium: 'text-status-warning',
  low: 'text-accent-green',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: unread = 0 } = useUnreadCount()
  const { data } = useNotifications(0, 5)
  const markAsRead = useMarkAsRead()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-text-muted hover:text-text-primary transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-status-danger text-white text-[10px] font-bold px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-[360px] card border border-border shadow-card-hover z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">Notificações</h3>
              {unread > 0 && (
                <span className="text-xs text-text-muted">{unread} não lidas</span>
              )}
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {(!data?.items || data.items.length === 0) ? (
                <p className="p-6 text-center text-text-muted text-sm">Nenhuma notificação</p>
              ) : (
                data.items.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.is_read) markAsRead.mutate(n.id) }}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-border/50 hover:bg-background-elevated/50 transition-colors',
                      !n.is_read && 'bg-accent-blue/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', SEVERITY_COLOR[n.severity])} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm truncate', n.is_read ? 'text-text-secondary' : 'text-text-primary font-medium')}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-text-muted mt-1">
                          {new Date(n.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' · '}
                          <span className={SEVERITY_DOT[n.severity]}>{n.severity}</span>
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border">
              <Link
                to="/alertas"
                onClick={() => setOpen(false)}
                className="text-xs text-accent-blue hover:text-accent-blue/80 font-medium"
              >
                Ver todas as notificações
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
