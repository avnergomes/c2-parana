// src/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Notification {
  id: string
  rule_id: string | null
  user_id: string
  channel: string
  title: string
  body: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  metadata: Record<string, unknown> | null
  is_read: boolean
  sent_at: string
  read_at: string | null
}

export function useNotifications(page = 0, pageSize = 20) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1
      const { data, error, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .order('sent_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return { items: (data || []) as Notification[], total: count || 0 }
    },
    staleTime: 1000 * 60,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) throw error
      return count || 0
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })
}

export function useMarkAsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useMarkAllAsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export interface NotificationPrefs {
  push_enabled: boolean
  email_enabled: boolean
  telegram_enabled: boolean
  telegram_chat_id: string | null
  email_digest: 'realtime' | 'daily' | 'weekly' | 'off'
  min_severity: 'critical' | 'high' | 'medium' | 'low'
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .maybeSingle()
      return (data as NotificationPrefs | null) || {
        push_enabled: true,
        email_enabled: true,
        telegram_enabled: false,
        telegram_chat_id: null,
        email_digest: 'daily' as const,
        min_severity: 'medium' as const,
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPrefs>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await (supabase as any)
        .from('notification_preferences')
        .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] })
    },
  })
}
