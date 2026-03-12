// src/hooks/useNoticiasRealtime.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Hook para receber atualizacoes em tempo real de noticias.
 * Requer que Supabase Realtime esteja habilitado para a tabela news_items
 * (Dashboard Supabase -> Database -> Replication -> habilitar news_items)
 */
export function useNoticiasRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('noticias-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        (payload) => {
          // Invalidar cache para forcar refetch
          queryClient.invalidateQueries({ queryKey: ['noticias'] })
          queryClient.invalidateQueries({ queryKey: ['noticias-stats'] })

          // Log para debug (pode ser removido em producao)
          if (import.meta.env.DEV) {
            console.log('[Realtime] Nova noticia:', payload.new)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Falha na conexão do canal noticias-changes')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
