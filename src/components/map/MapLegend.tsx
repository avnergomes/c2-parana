// src/components/map/MapLegend.tsx
import type { LayerId } from '@/types/mapa'

const DENGUE_LEGEND = [
  { color: '#10b981', label: 'Verde — sem alerta' },
  { color: '#f59e0b', label: 'Amarelo — alerta leve' },
  { color: '#f97316', label: 'Laranja — alerta moderado' },
  { color: '#ef4444', label: 'Vermelho — epidemia' },
]

interface MapLegendProps {
  activeLayers: LayerId[]
}

export function MapLegend({ activeLayers }: MapLegendProps) {
  if (!activeLayers.includes('dengue') && !activeLayers.includes('vbp')) return null

  return (
    <div className="absolute bottom-8 right-4 z-[1000] card p-3 space-y-3 max-w-[180px] shadow-card-hover">
      {activeLayers.includes('dengue') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Dengue</p>
          {DENGUE_LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-2xs text-text-secondary">{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {activeLayers.includes('vbp') && (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">VBP Agro (R$ mi)</p>
          <div className="h-3 w-full rounded" style={{ background: 'linear-gradient(to right, #064e3b, #10b981, #d1fae5)' }} />
          <div className="flex justify-between mt-0.5">
            <span className="text-2xs text-text-muted">Baixo</span>
            <span className="text-2xs text-text-muted">Alto</span>
          </div>
        </div>
      )}
    </div>
  )
}
