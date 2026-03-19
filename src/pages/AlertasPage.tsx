// src/pages/AlertasPage.tsx
import { useState } from 'react'
import { Bell, CheckCheck, Filter } from 'lucide-react'
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'
import type { Notification } from '@/hooks/useNotifications'

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-status-danger',
  high: 'bg-orange-500',
  medium: 'bg-status-warning',
  low: 'bg-accent-green',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
}

const DOMAIN_LABEL: Record<string, string> = {
  clima: 'Clima',
  saude: 'Saúde',
  ambiente: 'Ambiente',
  hidro: 'Hídrico',
  ar: 'Ar',
  composto: 'Composto',
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export function AlertasPage() {
  const [page, setPage] = useState(0)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const { data, isLoading } = useNotifications(page, 20)
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const filtered = data?.items.filter(n =>
    severityFilter === 'all' || n.severity === severityFilter
  ) || []

  const totalPages = Math.ceil((data?.total || 0) / 20)

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Bell size={24} />
            Centro de Alertas
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Notificações e alertas do sistema de monitoramento
          </p>
        </div>
        <button
          onClick={() => markAllAsRead.mutate()}
          disabled={markAllAsRead.isPending}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <CheckCheck size={16} />
          Marcar todas como lidas
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-text-muted" />
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => (
          <button
            key={sev}
            onClick={() => setSeverityFilter(sev)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full font-medium transition-colors',
              severityFilter === sev
                ? 'bg-accent-green/20 text-accent-green'
                : 'text-text-muted hover:text-text-secondary hover:bg-background-elevated'
            )}
          >
            {sev === 'all' ? 'Todas' : SEVERITY_LABEL[sev]}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-background-elevated rounded w-2/3 mb-2" />
              <div className="h-3 bg-background-elevated rounded w-1/2" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell size={40} className="mx-auto text-text-muted mb-4" />
            <p className="text-text-secondary">Nenhuma notificação encontrada</p>
          </div>
        ) : (
          filtered.map((n: Notification) => (
            <div
              key={n.id}
              className={cn(
                'card p-4 border-l-4 transition-all hover:shadow-card-hover cursor-pointer',
                n.is_read ? 'border-l-border opacity-70' : `border-l-${n.severity === 'critical' ? 'status-danger' : n.severity === 'high' ? 'orange-500' : n.severity === 'medium' ? 'status-warning' : 'accent-green'}`
              )}
              onClick={() => { if (!n.is_read) markAsRead.mutate(n.id) }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={cn('mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0', SEVERITY_COLOR[n.severity])} />
                  <div className="min-w-0">
                    <p className={cn('text-sm', n.is_read ? 'text-text-secondary' : 'text-text-primary font-semibold')}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-text-muted mt-1">{n.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
                      <span>{new Date(n.sent_at).toLocaleString('pt-BR')}</span>
                      <span className="px-1.5 py-0.5 rounded bg-background-elevated">
                        {SEVERITY_LABEL[n.severity]}
                      </span>
                      {n.metadata && typeof n.metadata === 'object' && 'domain' in n.metadata && (
                        <span className="px-1.5 py-0.5 rounded bg-background-elevated">
                          {DOMAIN_LABEL[String(n.metadata.domain)] || String(n.metadata.domain)}
                        </span>
                      )}
                      <span>{n.channel}</span>
                    </div>
                  </div>
                </div>
                {!n.is_read && (
                  <span className="w-2 h-2 rounded-full bg-accent-blue flex-shrink-0 mt-2" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded bg-background-elevated text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-text-muted">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded bg-background-elevated text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
