// src/lib/browserNotifications.ts
//
// Wrapper ao redor da Browser Notification API.
//
// Uso:
//   if (await requestPermission() === 'granted') {
//     show({ id, title, body, severity })
//   }
//
// Deliberadamente sem React aqui — esta camada e pura, sem hooks, pra poder ser
// chamada tanto do useNotificationsRealtime (event handler) quanto do botao de
// permissao em NotificationPrefsPage.

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export interface BrowserNotificationPayload {
  id: string
  title: string
  body: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | string
  metadata?: Record<string, unknown> | null
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  high: '🔶',
  medium: '📢',
  low: 'ℹ️',
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getPermission(): PermissionState {
  if (!isSupported()) return 'unsupported'
  return window.Notification.permission as PermissionState
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isSupported()) return 'unsupported'
  // Alguns navegadores antigos retornam undefined e exigem o callback API;
  // o `await` cobre ambos os casos porque Promise.resolve(undefined) resolve ok.
  const result = await window.Notification.requestPermission()
  return result as PermissionState
}

/**
 * Dispara uma notificacao nativa do SO. Silenciosa se a permissao nao estiver
 * concedida — nao lanca erro, apenas retorna.
 *
 * `tag` usa o id do registro para dedupe: se o mesmo alerta chegar duas vezes
 * por qualquer razao (replay do websocket, refetch), o SO substitui em vez de
 * empilhar.
 *
 * `requireInteraction` segura alertas criticos na bandeja ate o usuario
 * interagir; outros severidades auto-dismissem em ~5s.
 *
 * Click na notificacao foca a janela e navega para /alertas. Usa
 * window.location porque o handler roda fora do contexto do react-router.
 */
export function show(payload: BrowserNotificationPayload): Notification | null {
  if (getPermission() !== 'granted') return null

  const emoji = SEVERITY_EMOJI[payload.severity] || '📢'
  const notif = new window.Notification(`${emoji} ${payload.title}`, {
    body: payload.body || 'Alerta do sistema C2 Parana',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.id,
    requireInteraction: payload.severity === 'critical',
    silent: false,
  })

  notif.onclick = () => {
    window.focus()
    if (window.location.pathname !== '/alertas') {
      window.location.href = '/alertas'
    }
    notif.close()
  }

  return notif
}

/**
 * Checa se e seguro disparar uma notificacao agora. Retorna false se:
 * - permissao nao concedida
 * - tab em foco (usuario ja vai ver no sino)
 */
export function shouldShow(): boolean {
  if (getPermission() !== 'granted') return false
  if (typeof document === 'undefined') return false
  return document.visibilityState === 'hidden'
}
