// src/lib/sentry.ts
/**
 * Modulo de integracao com Sentry para captura de erros.
 *
 * Para habilitar:
 * 1. npm install @sentry/react
 * 2. Configurar VITE_SENTRY_DSN no .env
 */

const dsn = import.meta.env.VITE_SENTRY_DSN

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryModule: any = null

/**
 * Inicializa o Sentry para captura de erros.
 * So inicializa se o DSN estiver configurado e o pacote instalado.
 */
export async function initSentry(): Promise<void> {
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.log('[Sentry] DSN nao configurado, monitoramento desabilitado')
    }
    return
  }

  try {
    // Importacao dinamica para evitar erro quando pacote nao esta instalado
    // @ts-expect-error - modulo pode nao existir
    SentryModule = await import('@sentry/react')

    SentryModule.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.5,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
      ],
    })

    if (import.meta.env.DEV) {
      console.log('[Sentry] Inicializado com sucesso')
    }
  } catch {
    // @sentry/react nao instalado - ignorar silenciosamente
    if (import.meta.env.DEV) {
      console.log('[Sentry] Pacote @sentry/react nao instalado - instale com: npm install @sentry/react')
    }
  }
}

/**
 * Captura erro manualmente (para uso em catch blocks)
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (SentryModule) {
    SentryModule.captureException(error, { extra: context })
  }
  console.error(error)
}

/**
 * Define informacoes do usuario para contexto de erros
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (SentryModule) {
    SentryModule.setUser(user)
  }
}
