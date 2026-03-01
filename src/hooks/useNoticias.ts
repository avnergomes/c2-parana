// src/hooks/useNoticias.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NoticiaItem, LegislativoItem } from '@/types/noticias'

// Type for news_items table
interface NewsItemRow {
  id: string
  source: string
  title: string
  description: string | null
  url: string
  image_url: string | null
  published_at: string
  urgency: string
  category: string | null
  keywords: string[] | null
  fetched_at: string
}

// Type for legislative_items table
interface LegislativeItemRow {
  id: string
  external_id: string | null
  type: string
  number: string | null
  year: number | null
  title: string
  description: string | null
  author: string | null
  status: string | null
  url: string | null
  published_at: string | null
}

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

      const { data, error } = await query as { data: NewsItemRow[] | null; error: unknown }
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
        .limit(limit) as { data: LegislativeItemRow[] | null; error: unknown }
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
        .gte('published_at', since) as { data: Array<{ urgency: string }> | null }

      const urgentes = data?.filter(n => n.urgency === 'urgent').length || 0
      const importantes = data?.filter(n => n.urgency === 'important').length || 0
      const total = data?.length || 0

      return { urgentes, importantes, total }
    },
    staleTime: 1000 * 60 * 5,
  })
}
