// src/pages/NotificationPrefsPage.tsx
import { Settings, Mail, MessageCircle, Bell as BellIcon } from 'lucide-react'
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/hooks/useNotifications'
import type { NotificationPrefs } from '@/hooks/useNotifications'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-3">
      <span className="text-sm text-text-primary">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-accent-green' : 'bg-gray-600'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  )
}

export function NotificationPrefsPage() {
  const { data: prefs, isLoading } = useNotificationPrefs()
  const updatePrefs = useUpdateNotificationPrefs()

  const update = (partial: Partial<NotificationPrefs>) => {
    updatePrefs.mutate(partial)
  }

  if (isLoading || !prefs) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-background-elevated rounded w-48" />
          <div className="h-40 bg-background-elevated rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={24} />
          Preferências de Notificação
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Configure como e quando receber alertas do sistema
        </p>
      </div>

      {/* Channels */}
      <div className="card p-5 space-y-1">
        <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
          <BellIcon size={16} />
          Canais de Notificação
        </h2>
        <Toggle
          label="Push (navegador)"
          checked={prefs.push_enabled}
          onChange={v => update({ push_enabled: v })}
        />
        <Toggle
          label="Email"
          checked={prefs.email_enabled}
          onChange={v => update({ email_enabled: v })}
        />
        <Toggle
          label="Telegram"
          checked={prefs.telegram_enabled}
          onChange={v => update({ telegram_enabled: v })}
        />

        {prefs.telegram_enabled && (
          <div className="pl-4 pb-2">
            <label className="text-xs text-text-muted mb-1 block">Chat ID do Telegram</label>
            <input
              type="text"
              value={prefs.telegram_chat_id || ''}
              onChange={e => update({ telegram_chat_id: e.target.value })}
              placeholder="Ex: -1001234567890"
              className="input-field w-full max-w-xs"
            />
          </div>
        )}
      </div>

      {/* Email digest */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Mail size={16} />
          Frequência do Digest por Email
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['realtime', 'Tempo real'],
            ['daily', 'Diário'],
            ['weekly', 'Semanal'],
            ['off', 'Desligado'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => update({ email_digest: val })}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                prefs.email_digest === val
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                  : 'bg-background-elevated text-text-secondary hover:text-text-primary border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Min severity */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <MessageCircle size={16} />
          Severidade Mínima
        </h2>
        <p className="text-xs text-text-muted mb-3">
          Apenas alertas com severidade igual ou acima serão enviados
        </p>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['low', 'Baixo', 'bg-accent-green/20 text-accent-green border-accent-green/30'],
            ['medium', 'Médio', 'bg-status-warning/20 text-status-warning border-status-warning/30'],
            ['high', 'Alto', 'bg-orange-500/20 text-orange-500 border-orange-500/30'],
            ['critical', 'Crítico', 'bg-status-danger/20 text-status-danger border-status-danger/30'],
          ] as const).map(([val, label, activeClass]) => (
            <button
              key={val}
              onClick={() => update({ min_severity: val })}
              className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors border ${
                prefs.min_severity === val
                  ? activeClass
                  : 'bg-background-elevated text-text-secondary hover:text-text-primary border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {updatePrefs.isPending && (
        <p className="text-xs text-accent-green">Salvando...</p>
      )}
    </div>
  )
}
