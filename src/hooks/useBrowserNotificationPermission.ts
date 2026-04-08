// src/hooks/useBrowserNotificationPermission.ts
import { useCallback, useEffect, useState } from 'react'
import * as browserNotifications from '@/lib/browserNotifications'
import type { PermissionState } from '@/lib/browserNotifications'

/**
 * Hook React que expoe o estado atual da permissao de Notification do browser
 * e re-renderiza quando ele muda.
 *
 * Usa a Permissions API (navigator.permissions.query) quando disponivel para
 * receber eventos de mudanca — isso cobre o caso do usuario alterar a
 * permissao via configuracoes do browser enquanto a aba esta aberta.
 *
 * Quando a Permissions API nao esta disponivel (Safari < 16), o hook ainda
 * funciona mas nao reage a mudancas externas — so ao proprio requestPermission.
 */
export function useBrowserNotificationPermission() {
  const [permission, setPermission] = useState<PermissionState>(() =>
    browserNotifications.getPermission()
  )

  useEffect(() => {
    if (!browserNotifications.isSupported()) return
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return

    let cancelled = false
    let status: PermissionStatus | null = null

    const handler = () => {
      if (!cancelled && status) {
        setPermission(status.state as PermissionState)
      }
    }

    // TypeScript nao tem 'notifications' no PermissionName padrao ainda,
    // mas ele e suportado nos browsers modernos — cast seguro.
    navigator.permissions
      .query({ name: 'notifications' as PermissionName })
      .then(s => {
        if (cancelled) return
        status = s
        setPermission(s.state as PermissionState)
        s.addEventListener('change', handler)
      })
      .catch(() => {
        // Permissions API rejeitou — fallback silencioso para o estado atual
      })

    return () => {
      cancelled = true
      if (status) {
        status.removeEventListener('change', handler)
      }
    }
  }, [])

  const request = useCallback(async () => {
    const result = await browserNotifications.requestPermission()
    setPermission(result)
    return result
  }, [])

  return {
    permission,
    isSupported: browserNotifications.isSupported(),
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',
    request,
  }
}
