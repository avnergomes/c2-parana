// src/hooks/useNotificationsRealtime.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Hook para receber novas notificacoes em tempo real via Supabase Realtime.
 *
 * Quando o motor de alertas (etl_alerts_engine.py) dispara um alerta e insere
 * uma linha em `notifications`, este hook recebe o evento e invalida os caches
 * react-query do sino e da AlertasPage, fazendo a UI atualizar em < 1s em vez
 * dos 60s do polling.
 *
 * Requer que Supabase Realtime esteja habilitado para a tabela notifications
 * (Dashboard Supabase -> Database -> Replication -> habilitar notifications)
 */
export function useNotificationsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          // Invalidar caches para forcar refetch imediato
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })

          if (import.meta.env.DEV) {
            console.log('[Realtime] Nova notificacao:', payload.new)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        () => {
          // UPDATE pode ser marcar como lida em outro dispositivo; re-sincronizar
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Falha na conexao do canal notifications-changes')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
