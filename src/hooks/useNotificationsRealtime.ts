// src/hooks/useNotificationsRealtime.ts
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNotificationPrefs } from '@/hooks/useNotifications'
import type { NotificationPrefs } from '@/hooks/useNotifications'
import * as browserNotifications from '@/lib/browserNotifications'

interface NotificationRow {
  id: string
  title: string
  body: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  metadata?: Record<string, unknown> | null
  is_read?: boolean
}

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

/**
 * Hook para receber novas notificacoes em tempo real via Supabase Realtime.
 *
 * Quando o motor de alertas (etl_alerts_engine.py) dispara um alerta e insere
 * uma linha em `notifications`, este hook recebe o evento e:
 *
 *   1. Invalida os caches react-query (sino + AlertasPage) em < 1s.
 *   2. Dispara uma Browser Notification nativa, com gating:
 *        - permissao do browser === 'granted'
 *        - push_enabled === true nas preferencias do usuario
 *        - severidade >= min_severity das preferencias
 *        - aba NAO esta com foco (visibilityState === 'hidden')
 *          — se a aba estiver ativa o usuario ja ve o sino pulsar; notificacao
 *            nativa seria ruido duplicado.
 *
 * Requer que Supabase Realtime esteja habilitado para a tabela notifications
 * (feito na migration 013_realtime_notifications.sql).
 */
export function useNotificationsRealtime() {
  const queryClient = useQueryClient()
  const { data: prefs } = useNotificationPrefs()

  // Mantem o valor atual das prefs acessivel dentro do handler de INSERT sem
  // causar re-subscribe do canal a cada mudanca (closures estaveis + ref movel)
  const prefsRef = useRef<NotificationPrefs | undefined>(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  useEffect(() => {
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          // 1. Invalidar caches para forcar refetch imediato
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })

          if (import.meta.env.DEV) {
            console.log('[Realtime] Nova notificacao:', payload.new)
          }

          // 2. Tentar disparar browser notification nativa
          const row = payload.new as NotificationRow
          tryShowBrowserNotification(row, prefsRef.current)
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

/**
 * Aplica o gating completo e dispara a notificacao nativa se tudo passar.
 * Separado em funcao pura para facilitar teste e leitura.
 */
function tryShowBrowserNotification(
  row: NotificationRow,
  prefs: NotificationPrefs | undefined
): void {
  // Gate 1: permissao do browser + tab em background
  if (!browserNotifications.shouldShow()) return

  // Gate 2: preferencia do usuario push_enabled
  if (prefs && prefs.push_enabled === false) return

  // Gate 3: severidade minima (belt-and-suspenders — o server tambem filtra)
  if (prefs) {
    const rowSev = SEVERITY_ORDER[row.severity] ?? 0
    const minSev = SEVERITY_ORDER[prefs.min_severity] ?? 0
    if (rowSev < minSev) return
  }

  browserNotifications.show({
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    metadata: row.metadata,
  })
}
