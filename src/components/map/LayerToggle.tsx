// src/components/map/LayerToggle.tsx
import { LAYER_CONFIGS, type LayerId } from '@/types/mapa'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

interface LayerToggleProps {
  activeLayers: LayerId[]
  onToggle: (layerId: LayerId) => void
}

export function LayerToggle({ activeLayers, onToggle }: LayerToggleProps) {
  const { isPro } = useAuth()

  return (
    <div className="absolute top-4 left-4 z-[1000] card p-3 min-w-[160px] shadow-card-hover">
      <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-2">Camadas</p>
      <div className="space-y-1.5">
        {LAYER_CONFIGS.map(layer => {
          const locked = layer.plan === 'pro' && !isPro
          const active = activeLayers.includes(layer.id)

          return (
            <button
              key={layer.id}
              onClick={() => !locked && onToggle(layer.id)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-all',
                locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-background-elevated cursor-pointer',
                active && !locked ? 'bg-background-elevated' : ''
              )}
              title={locked ? 'Disponível no plano Pro' : layer.description}
            >
              <span
                className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', active && !locked ? 'ring-2 ring-white/20' : 'opacity-40')}
                style={{ backgroundColor: layer.color }}
              />
              <span className={cn('text-xs font-medium', active && !locked ? 'text-text-primary' : 'text-text-secondary')}>
                {layer.label}
              </span>
              {locked && <span className="ml-auto text-text-muted text-2xs">Pro</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
