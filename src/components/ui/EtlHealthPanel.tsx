// src/components/ui/EtlHealthPanel.tsx
import { useEtlHealth, ETL_FRESHNESS_HOURS, ETL_FRESHNESS_DEFAULT_HOURS } from '@/hooks/useEtlHealth'
import { Activity, CheckCircle, AlertTriangle, XCircle, Clock, RefreshCw } from 'lucide-react'

function StatusIcon({ status }: { status: string }) {
  const s = status?.toLowerCase()
  if (s === 'success' || s === 'ok') {
    return <CheckCircle className="w-4 h-4 text-accent-green" />
  }
  if (s === 'partial' || s === 'unavailable' || s === 'stale') {
    return <AlertTriangle className="w-4 h-4 text-status-warning" />
  }
  return <XCircle className="w-4 h-4 text-status-danger" />
}

function timeAgo(iso: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

function isStale(iso: string, maxHours: number): boolean {
  if (!iso) return true
  const diff = Date.now() - new Date(iso).getTime()
  return diff > maxHours * 3600000
}

export function EtlHealthPanel() {
  const { data: health, isLoading, refetch, isRefetching } = useEtlHealth()

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-white/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-text-primary">Status dos Pipelines</h3>
        </div>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-8 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const etls = health || []

  // Conta como saudavel: status success/ok E nao stale (dentro da janela do cron)
  const totalEtls = 6
  const healthyCount = etls.filter(e => {
    const s = e.data?.status?.toLowerCase()
    if (s !== 'success' && s !== 'ok') return false
    const limit = ETL_FRESHNESS_HOURS[e.cache_key] ?? ETL_FRESHNESS_DEFAULT_HOURS
    return !isStale(e.data?.last_run, limit)
  }).length
  const overallStatus = healthyCount === totalEtls
    ? 'healthy'
    : healthyCount >= totalEtls / 2
      ? 'degraded'
      : 'critical'

  return (
    <div className="bg-card rounded-lg border border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-text-primary">Status dos Pipelines</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            overallStatus === 'healthy' ? 'bg-accent-green/20 text-accent-green' :
            overallStatus === 'degraded' ? 'bg-status-warning/20 text-status-warning' :
            'bg-status-danger/20 text-status-danger'
          }`}>
            {healthyCount}/{totalEtls} OK
          </span>
          <button
            onClick={() => refetch()}
            className="p-1 rounded hover:bg-white/5 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-text-secondary ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {etls.length === 0 ? (
          <p className="text-xs text-text-secondary">
            Nenhum registro de saúde dos ETLs encontrado. Execute os pipelines pelo menos uma vez.
          </p>
        ) : (
          etls.map(etl => {
            const d = etl.data || {}
            const freshnessLimit = ETL_FRESHNESS_HOURS[etl.cache_key] ?? ETL_FRESHNESS_DEFAULT_HOURS
            const stale = isStale(d.last_run, freshnessLimit)
            const hasErrors = d.errors && d.errors.length > 0
            // status reportado pelo proprio ETL na ultima execucao
            const reportedStatus = d.status?.toLowerCase()
            // Stale-mas-success vira "stale" (warning amarelo); stale com erro
            // ou status nao-success vai pra logica normal (vermelho).
            const displayStatus = stale && (reportedStatus === 'success' || reportedStatus === 'ok')
              ? 'stale'
              : d.status

            return (
              <div
                key={etl.cache_key}
                className={`flex items-center justify-between py-1.5 px-2 rounded ${
                  stale ? 'bg-status-warning/5' : 'bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={displayStatus} />
                  <span className="text-xs text-text-primary truncate">
                    {etl.displayName}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {d.duration_seconds != null && (
                    <span className="text-xs text-text-secondary font-mono">
                      {d.duration_seconds.toFixed(1)}s
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-text-secondary" />
                    <span className={`text-xs ${stale ? 'text-status-warning' : 'text-text-secondary'}`}>
                      {timeAgo(d.last_run)}
                    </span>
                  </div>
                  {hasErrors && (
                    <span className="text-xs text-status-danger" title={d.errors.join('\n')}>
                      {d.errors.length} erro{d.errors.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
