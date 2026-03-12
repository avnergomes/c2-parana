// src/components/map/MapLegend.tsx
import type { LayerId } from '@/types/mapa'

const DENGUE_LEGEND = [
  { color: '#065f46', label: 'Normal' },
  { color: '#92400e', label: 'Alerta' },
  { color: '#c2410c', label: 'Moderado' },
  { color: '#7f1d1d', label: 'Epidemia' },
]

const RESERVATORIO_LEGEND = [
  { color: '#ef4444', label: '< 30% Critico' },
  { color: '#f59e0b', label: '30-50% Baixo' },
  { color: '#3b82f6', label: '50-80% Normal' },
  { color: '#06b6d4', label: '> 80% Cheio' },
]

interface MapLegendProps {
  activeLayers: LayerId[]
}

export function MapLegend({ activeLayers }: MapLegendProps) {
  const hasAny = activeLayers.some(l =>
    ['dengue', 'vbp', 'credito', 'reservatorios', 'clima', 'queimadas'].includes(l)
  )
  if (!hasAny) return null

  return (
    <div className="absolute bottom-8 right-4 z-[1000] card p-3 space-y-3 max-w-[180px] shadow-card-hover">
      {activeLayers.includes('clima') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Clima</p>
          <div className="h-3 w-full rounded" style={{ background: 'linear-gradient(to right, #60a5fa, #34d399, #fbbf24, #f97316, #ef4444)' }} />
          <div className="flex justify-between mt-0.5">
            <span className="text-2xs text-text-muted">&lt;10°C</span>
            <span className="text-2xs text-text-muted">&gt;32°C</span>
          </div>
        </div>
      )}

      {activeLayers.includes('dengue') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Dengue</p>
          {DENGUE_LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-2 mb-0.5">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-2xs text-text-secondary">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {activeLayers.includes('vbp') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">VBP Agro</p>
          <div className="h-3 w-full rounded" style={{ background: 'linear-gradient(to right, #064e3b, #10b981, #34d399)' }} />
          <div className="flex justify-between mt-0.5">
            <span className="text-2xs text-text-muted">Baixo</span>
            <span className="text-2xs text-text-muted">Alto</span>
          </div>
        </div>
      )}

      {activeLayers.includes('credito') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Credito Rural</p>
          <div className="h-3 w-full rounded" style={{ background: 'linear-gradient(to right, #4c1d95, #7c3aed, #a78bfa)' }} />
          <div className="flex justify-between mt-0.5">
            <span className="text-2xs text-text-muted">Baixo</span>
            <span className="text-2xs text-text-muted">Alto</span>
          </div>
        </div>
      )}

      {activeLayers.includes('reservatorios') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Reservatorios</p>
          {RESERVATORIO_LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-2 mb-0.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-2xs text-text-secondary">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {activeLayers.includes('queimadas') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Queimadas</p>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#ef4444' }} />
            <span className="text-2xs text-text-secondary">Foco de calor (7d)</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444', opacity: 0.6 }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444', opacity: 0.8 }} />
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444', opacity: 1 }} />
            <span className="text-2xs text-text-muted ml-1">Intensidade</span>
          </div>
        </div>
      )}
    </div>
  )
}
