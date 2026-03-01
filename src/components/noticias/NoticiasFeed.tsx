// src/components/noticias/NoticiasFeed.tsx
import { useState } from 'react'
import { useNoticias } from '@/hooks/useNoticias'
import { NoticiaCard } from './NoticiaItem'
import { SOURCE_CONFIG } from '@/types/noticias'
import type { NoticiaItem } from '@/types/noticias'
import { SkeletonList } from '@/components/ui/SkeletonCard'

type FilterSource = NoticiaItem['source'] | 'all'
type FilterUrgency = NoticiaItem['urgency'] | 'all'

export function NoticiasFeed() {
  const [source, setSource] = useState<FilterSource>('all')
  const [urgency, setUrgency] = useState<FilterUrgency>('all')

  const { data: noticias, isLoading, dataUpdatedAt } = useNoticias({ source, urgency, limit: 80 })

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Filtro de fonte */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSource('all')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${source === 'all' ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-border text-text-secondary'}`}
          >
            Todas
          </button>
          {(Object.entries(SOURCE_CONFIG) as [NoticiaItem['source'], typeof SOURCE_CONFIG[keyof typeof SOURCE_CONFIG]][]).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => setSource(id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${source === id ? 'border-current text-current' : 'border-border text-text-secondary'}`}
              style={{ color: source === id ? cfg.color : undefined, borderColor: source === id ? cfg.color : undefined, background: source === id ? cfg.color + '20' : undefined }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Filtro de urgência */}
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'urgent', label: '🔴 Urgente' },
            { id: 'important', label: '🟡 Importante' },
          ].map(u => (
            <button
              key={u.id}
              onClick={() => setUrgency(u.id as FilterUrgency)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${urgency === u.id ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border text-text-secondary'}`}
            >
              {u.label}
            </button>
          ))}
        </div>

        {lastUpdate && (
          <span className="text-2xs text-text-muted ml-auto">
            Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Feed */}
      {isLoading ? (
        <SkeletonList rows={8} />
      ) : !noticias?.length ? (
        <div className="card p-8 text-center text-text-secondary">
          <p>Nenhuma notícia encontrada. Os crons atualizam a cada 15 minutos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {noticias.map(item => (
            <NoticiaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
