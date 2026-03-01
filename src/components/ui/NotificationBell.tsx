// src/components/ui/NotificationBell.tsx
import { useState } from 'react'
import { Bell } from 'lucide-react'

interface Alert {
  id: string
  title: string
  severity: string
  is_active: boolean
}

interface NotificationBellProps {
  alerts?: Alert[]
}

export function NotificationBell({ alerts = [] }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const activeAlerts = alerts.filter(a => a.is_active)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-text-muted hover:text-text-primary transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {activeAlerts.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-status-danger rounded-full text-white text-[10px] flex items-center justify-center font-bold">
            {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Overlay para fechar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-72 card border border-border shadow-card-hover z-50 animate-fade-in">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Alertas Ativos</p>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {activeAlerts.length === 0 ? (
                <p className="p-4 text-sm text-text-muted text-center">
                  Sem alertas ativos
                </p>
              ) : (
                activeAlerts.map(alert => (
                  <div key={alert.id} className="p-3 border-b border-border/50 last:border-0 hover:bg-background-elevated transition-colors">
                    <p className="text-xs font-medium text-text-primary line-clamp-2">
                      {alert.title}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5 capitalize">
                      {alert.severity}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
