// src/components/noticias/AlepFeed.tsx
import { useLegislativo } from '@/hooks/useNoticias'
import { timeAgo } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  projeto_lei: 'PL',
  sessao: 'Sessão',
  votacao: 'Votação',
  noticia: 'Notícia',
}

const TYPE_COLORS: Record<string, string> = {
  projeto_lei: '#8b5cf6',
  sessao: '#3b82f6',
  votacao: '#f59e0b',
  noticia: '#10b981',
}

export function AlepFeed() {
  const { data: items, isLoading } = useLegislativo(20)

  return (
    <div className="space-y-2">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-3 animate-pulse">
            <div className="h-3 bg-background-elevated rounded w-full mb-2" />
            <div className="h-3 bg-background-elevated rounded w-2/3" />
          </div>
        ))
      ) : !items?.length ? (
        <div className="card p-6 text-center text-text-secondary text-sm">
          Sem dados legislativos recentes. O cron atualiza diariamente às 9h.
        </div>
      ) : (
        items.map(item => (
          <div key={item.id} className="card p-3 border-l-2" style={{ borderLeftColor: TYPE_COLORS[item.type] || '#374151' }}>
            <div className="flex items-start gap-2">
              <span
                className="text-2xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                style={{ background: (TYPE_COLORS[item.type] || '#374151') + '25', color: TYPE_COLORS[item.type] || '#9ca3af' }}
              >
                {TYPE_LABELS[item.type] || item.type}
                {item.number && ` ${item.number}`}
                {item.year && `/${item.year}`}
              </span>
              <div className="flex-1 min-w-0">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener" className="text-xs font-medium text-text-primary hover:text-accent-green transition-colors line-clamp-2">
                    {item.title}
                  </a>
                ) : (
                  <p className="text-xs font-medium text-text-primary line-clamp-2">{item.title}</p>
                )}
                {item.author && <p className="text-2xs text-text-muted mt-0.5">{item.author}</p>}
                {item.status && (
                  <span className="text-2xs text-text-secondary">{item.status}</span>
                )}
              </div>
              <span className="text-2xs text-text-muted flex-shrink-0">
                {item.published_at ? timeAgo(item.published_at) : '—'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
