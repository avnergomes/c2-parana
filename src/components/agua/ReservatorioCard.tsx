// src/components/agua/ReservatorioCard.tsx
import { cn } from '@/lib/utils'
import { volumeToColor, volumeToLabel } from '@/types/infohidro'
import type { ReservatorioData } from '@/types/infohidro'

interface ReservatorioCardProps {
  reservatorio: ReservatorioData
}

export function ReservatorioCard({ reservatorio: r }: ReservatorioCardProps) {
  const color = volumeToColor(r.volume_percent)
  const status = volumeToLabel(r.volume_percent)
  const tendenciaIcon = r.tendencia === 'subindo' ? '▲' : r.tendencia === 'descendo' ? '▼' : '—'

  return (
    <div className="card p-4 hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text-primary text-sm">{r.nome}</h3>
          <span
            className={cn('text-2xs font-medium px-1.5 py-0.5 rounded')}
            style={{ backgroundColor: `${color}20`, color }}
          >
            {status}
          </span>
        </div>
        <span className="text-2xl" style={{ color }}>💧</span>
      </div>

      {/* Volume bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-muted">Volume</span>
          <span className="font-mono font-semibold text-text-primary">{r.volume_percent.toFixed(1)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-background-elevated overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(r.volume_percent, 100)}%`, backgroundColor: color }}
          />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-muted block">Cota</span>
          <span className="font-mono text-text-primary">{r.cota_m.toFixed(2)} m</span>
        </div>
        <div>
          <span className="text-text-muted block">Capacidade</span>
          <span className="font-mono text-text-primary">{r.volume_hm3.toFixed(2)} hm³</span>
        </div>
        {r.vazao_afluente != null && (
          <div>
            <span className="text-text-muted block">Afl.</span>
            <span className="font-mono text-text-primary">{r.vazao_afluente.toFixed(2)} m³/s</span>
          </div>
        )}
        {r.vazao_defluente != null && (
          <div>
            <span className="text-text-muted block">Defl.</span>
            <span className="font-mono text-text-primary">{r.vazao_defluente.toFixed(2)} m³/s</span>
          </div>
        )}
        <div>
          <span className="text-text-muted block">Tendência</span>
          <span className={cn(
            'font-mono',
            r.tendencia === 'subindo' ? 'text-status-success' : r.tendencia === 'descendo' ? 'text-status-danger' : 'text-text-secondary'
          )}>
            {tendenciaIcon} {r.tendencia || 'Estável'}
          </span>
        </div>
        {r.chuva_mensal_mm != null && (
          <div>
            <span className="text-text-muted block">Chuva mês</span>
            <span className="font-mono text-text-primary">{r.chuva_mensal_mm.toFixed(1)} mm</span>
          </div>
        )}
      </div>
    </div>
  )
}
