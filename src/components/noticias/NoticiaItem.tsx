// src/components/noticias/NoticiaItem.tsx
import type { NoticiaItem } from '@/types/noticias'
import { SOURCE_CONFIG, URGENCY_CONFIG } from '@/types/noticias'
import { timeAgo } from '@/lib/utils'
import { cn, stripHtml } from '@/lib/utils'

interface NoticiaItemProps {
  item: NoticiaItem
  compact?: boolean
}

export function NoticiaCard({ item, compact = false }: NoticiaItemProps) {
  const source = SOURCE_CONFIG[item.source]
  const urgency = URGENCY_CONFIG[item.urgency]

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'block card p-3 border-l-2 hover:shadow-card-hover transition-all group',
        urgency.border
      )}
      style={{ borderLeftColor: item.urgency !== 'normal' ? urgency.color : '#1f2937' }}
    >
      <div className="flex items-start gap-3">
        {/* Imagem thumbnail */}
        {item.image_url && !compact && (
          <img
            src={item.image_url}
            alt=""
            className="w-16 h-12 object-cover rounded flex-shrink-0 opacity-80"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Badges: urgência + fonte */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {item.urgency !== 'normal' && (
              <span className="text-2xs font-semibold" style={{ color: urgency.color }}>
                {urgency.label}
              </span>
            )}
            <span
              className="text-2xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: source.color + '25', color: source.color }}
            >
              {source.label}
            </span>
          </div>

          {/* Título */}
          <h3 className={cn(
            'font-medium text-text-primary leading-snug group-hover:text-accent-green transition-colors',
            compact ? 'text-xs' : 'text-sm'
          )}>
            {item.title}
          </h3>

          {/* Descrição (strip HTML tags do RSS) */}
          {!compact && item.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">
              {stripHtml(item.description)}
            </p>
          )}

          {/* Tempo */}
          <p className="text-2xs text-text-muted mt-1">{timeAgo(item.published_at)}</p>
        </div>

        {/* Seta */}
        <svg className="w-4 h-4 text-text-muted flex-shrink-0 group-hover:text-accent-green transition-colors mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    </a>
  )
}
