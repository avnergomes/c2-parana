# 10 — NEWS MODULE: Módulo Notícias e Legislativo

## Descrição
Implementa o módulo de notícias com RSS parser (Gazeta do Povo, G1 PR, AEN, Banda B, Google News), classificação por urgência via keywords, timeline feed estilo WorldMonitor com auto-refresh, filtro por fonte, e integração com ALEP (projetos de lei, sessões).

## Pré-requisitos
- Prompts 01–04 concluídos
- Dados de notícias populados no Supabase (pelo cron do prompt 11)

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo de Notícias e Legislativo do C2 Paraná. Execute todos os passos.

## PASSO 1: Criar src/types/noticias.ts

```typescript
// src/types/noticias.ts
export interface NoticiaItem {
  id: string
  source: 'gazeta' | 'g1pr' | 'aen' | 'bandab' | 'gnews' | 'alep'
  title: string
  description: string | null
  url: string
  image_url: string | null
  published_at: string
  urgency: 'urgent' | 'important' | 'normal'
  category: string | null
  keywords: string[] | null
  fetched_at: string
}

export interface LegislativoItem {
  id: string
  external_id: string | null
  type: 'projeto_lei' | 'sessao' | 'votacao' | 'noticia'
  number: string | null
  year: number | null
  title: string
  description: string | null
  author: string | null
  status: string | null
  url: string | null
  published_at: string | null
}

export const SOURCE_CONFIG: Record<NoticiaItem['source'], { label: string; color: string; url: string }> = {
  gazeta: { label: 'Gazeta do Povo', color: '#3b82f6', url: 'gazetadopovo.com.br' },
  g1pr: { label: 'G1 Paraná', color: '#ef4444', url: 'g1.globo.com' },
  aen: { label: 'AEN PR', color: '#10b981', url: 'parana.pr.gov.br' },
  bandab: { label: 'Banda B', color: '#f59e0b', url: 'bandab.com.br' },
  gnews: { label: 'Google News', color: '#9ca3af', url: 'news.google.com' },
  alep: { label: 'ALEP', color: '#8b5cf6', url: 'assembleia.pr.leg.br' },
}

export const URGENCY_CONFIG = {
  urgent: { color: '#ef4444', bg: 'bg-red-900/30', border: 'border-red-700/50', label: '🔴 URGENTE' },
  important: { color: '#f59e0b', bg: 'bg-amber-900/30', border: 'border-amber-700/50', label: '🟡 IMPORTANTE' },
  normal: { color: '#4b5563', bg: '', border: 'border-border', label: '' },
}

// Keywords para classificação de urgência (também usadas no ETL)
export const URGENT_KEYWORDS = [
  'acidente', 'emergência', 'tragédia', 'morto', 'mortes', 'vítima', 'grave',
  'explosão', 'incêndio', 'enchente', 'desastre', 'colapso', 'desabamento',
  'epidemia', 'surto', 'alerta máximo', 'evacuação', 'bloqueio', 'interdição',
]

export const IMPORTANT_KEYWORDS = [
  'decreto', 'lei aprovada', 'votação', 'aprovado', 'vetado', 'sancionado',
  'operação policial', 'prisão', 'preso', 'investigação', 'auditoria',
  'chuva intensa', 'temporal', 'granizo', 'seca', 'estiagem',
  'reajuste', 'aumento', 'queda', 'recorde', 'histórico',
]
```

## PASSO 2: Criar src/hooks/useNoticias.ts

```typescript
// src/hooks/useNoticias.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NoticiaItem, LegislativoItem } from '@/types/noticias'

interface UseNoticiasOptions {
  source?: NoticiaItem['source'] | 'all'
  urgency?: NoticiaItem['urgency'] | 'all'
  limit?: number
}

export function useNoticias(options: UseNoticiasOptions = {}) {
  const { source = 'all', urgency = 'all', limit = 50 } = options

  return useQuery({
    queryKey: ['noticias', source, urgency, limit],
    queryFn: async () => {
      let query = supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit)

      if (source !== 'all') {
        query = query.eq('source', source)
      }
      if (urgency !== 'all') {
        query = query.eq('urgency', urgency)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as NoticiaItem[]
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 15, // auto-refresh a cada 15min
  })
}

export function useLegislativo(limit = 20) {
  return useQuery({
    queryKey: ['legislativo', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('legislative_items')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data || []) as LegislativoItem[]
    },
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 60,
  })
}

export function useNoticiasStats() {
  return useQuery({
    queryKey: ['noticias-stats'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('news_items')
        .select('urgency')
        .gte('published_at', since)

      const urgentes = data?.filter(n => n.urgency === 'urgent').length || 0
      const importantes = data?.filter(n => n.urgency === 'important').length || 0
      const total = data?.length || 0

      return { urgentes, importantes, total }
    },
    staleTime: 1000 * 60 * 5,
  })
}
```

## PASSO 3: Criar src/components/noticias/NoticiaItem.tsx

```typescript
// src/components/noticias/NoticiaItem.tsx
import type { NoticiaItem } from '@/types/noticias'
import { SOURCE_CONFIG, URGENCY_CONFIG } from '@/types/noticias'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

          {/* Descrição */}
          {!compact && item.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.description}</p>
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
```

## PASSO 4: Criar src/components/noticias/NoticiasFeed.tsx

```typescript
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
```

## PASSO 5: Criar src/components/noticias/AlepFeed.tsx

```typescript
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
```

## PASSO 6: Criar src/pages/NoticiasPage.tsx (completo)

```typescript
// src/pages/NoticiasPage.tsx
import { useState } from 'react'
import { NoticiasFeed } from '@/components/noticias/NoticiasFeed'
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { KpiCard } from '@/components/ui/KpiCard'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { useNoticiasStats } from '@/hooks/useNoticias'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

type Tab = 'feed' | 'alep'

export function NoticiasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const { data: stats } = useNoticiasStats()

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Notícias & Legislativo</h1>
          <p className="text-text-secondary text-sm mt-1">RSS · ALEP · Atualização a cada 15 minutos</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs 24h */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Notícias (24h)" value={stats?.total ?? '—'} accentColor="blue" />
        <KpiCard label="Urgentes (24h)" value={stats?.urgentes ?? 0} accentColor={stats?.urgentes ? 'red' : 'green'} />
        <KpiCard label="Importantes (24h)" value={stats?.importantes ?? 0} accentColor="yellow" />
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {[
            { id: 'feed', label: 'Feed de Notícias' },
            { id: 'alep', label: 'Legislativo (ALEP)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-accent-green text-accent-green'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <ErrorBoundary moduleName={activeTab}>
        {activeTab === 'feed' && <NoticiasFeed />}
        {activeTab === 'alep' && <AlepFeed />}
      </ErrorBoundary>
    </div>
  )
}
```

## PASSO 7: Atualizar src/pages/LegislativoPage.tsx

```typescript
// src/pages/LegislativoPage.tsx
// Redirecionar para NoticiasPage tab ALEP ou mostrar conteúdo dedicado
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function LegislativoPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Legislativo</h1>
        <p className="text-text-secondary text-sm mt-1">
          Assembleia Legislativa do Paraná — projetos de lei, sessões e votações
        </p>
      </div>
      <ErrorBoundary moduleName="legislativo">
        <AlepFeed />
      </ErrorBoundary>
    </div>
  )
}
```
```

---

## Arquivos Criados/Modificados

```
src/
├── types/noticias.ts                     (CRIADO)
├── hooks/useNoticias.ts                  (CRIADO)
├── components/noticias/
│   ├── NoticiaItem.tsx                   (CRIADO)
│   ├── NoticiasFeed.tsx                  (CRIADO)
│   └── AlepFeed.tsx                      (CRIADO)
└── pages/
    ├── NoticiasPage.tsx                  (SUBSTITUÍDO)
    └── LegislativoPage.tsx               (SUBSTITUÍDO)
```

---

## Verificação

1. Navegar para `/noticias` → ver feed de notícias ordenado por data
2. Filtrar por fonte: "G1 Paraná" → apenas notícias do G1
3. Filtrar por urgência: "Urgente" → notícias com badge vermelho
4. Tab "Legislativo (ALEP)" → projetos de lei listados
5. `refetchInterval: 900000` → dados atualizam a cada 15min automaticamente

---

## Notas Técnicas

- **RSS CORS**: A maioria dos feeds RSS tem CORS bloqueado no browser. Os dados DEVEM ser buscados pelo ETL (GitHub Actions) e salvos no Supabase. Não tente fetch de RSS direto do React.
- **Classificação de urgência**: Feita no ETL Python (script `etl_noticias.py` do prompt 11) usando as listas `URGENT_KEYWORDS` e `IMPORTANT_KEYWORDS`. O React apenas exibe a classificação já salva no banco.
- **ALEP API**: `http://webservices.assembleia.pr.leg.br/api/public` — endpoint REST público. O ETL busca projetos e sessões recentes. A API pode estar instável; o ETL deve ter retry e graceful failure.
- **Deduplicação**: O campo `url` em `news_items` tem constraint UNIQUE. O ETL usa UPSERT para evitar duplicatas de feeds com cache.
