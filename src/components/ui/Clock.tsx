// src/components/ui/Clock.tsx
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const brasiliaTime = format(now, "HH:mm:ss", { locale: ptBR })
  const utcTime = format(new Date(now.getTime() + now.getTimezoneOffset() * 60000), "HH:mm")
  const dateStr = format(now, "dd/MM/yyyy", { locale: ptBR })

  return (
    <div className="hidden md:flex items-center gap-3 text-xs font-mono">
      <div className="text-right">
        <div className="text-text-primary font-semibold">{brasiliaTime}</div>
        <div className="text-text-muted">{dateStr} · BRT</div>
      </div>
      <div className="w-px h-6 bg-border" />
      <div>
        <div className="text-text-secondary">{utcTime}</div>
        <div className="text-text-muted">UTC</div>
      </div>
    </div>
  )
}
