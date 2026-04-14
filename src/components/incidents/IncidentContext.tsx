// src/components/incidents/IncidentContext.tsx
// ORIENT panel: auto-fetches context data for affected municipalities
import { Thermometer, Shield, Droplet, Activity, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIRTC, getIRTCColor } from '@/hooks/useIRTC'
import type { Incident } from '@/types/incident'

export function IncidentContext({ incident }: { incident: Incident }) {
  const { data: irtcMap } = useIRTC()

  const municipalities = incident.affected_municipalities || []
  const ctx = incident.context || {}

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Contextualizacao (Orient)
      </h3>

      {/* Affected municipalities */}
      {municipalities.length > 0 && (
        <div className="p-4 rounded-lg bg-background-secondary border border-border">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-text-muted" />
            <h4 className="text-sm font-semibold text-text-primary">
              Municipios Afetados ({municipalities.length})
            </h4>
          </div>
          <div className="space-y-2">
            {municipalities.map((mun) => {
              const irtc = irtcMap?.get(mun.ibge_code)
              return (
                <div
                  key={mun.ibge_code}
                  className="flex items-center justify-between p-2 rounded bg-background-elevated"
                >
                  <span className="text-sm text-text-primary">{mun.name}</span>
                  {irtc ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: getIRTCColor(irtc.irtc) }}
                      />
                      <span className="text-xs text-text-secondary">
                        IRTC {irtc.irtc.toFixed(1)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold"
                        style={{
                          backgroundColor: `${getIRTCColor(irtc.irtc)}20`,
                          color: getIRTCColor(irtc.irtc),
                        }}
                      >
                        {irtc.riskLevel}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted italic">sem IRTC</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Context snapshot (from detection moment) */}
      {Object.keys(ctx).length > 0 && (
        <div className="p-4 rounded-lg bg-background-secondary border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-text-muted" />
            <h4 className="text-sm font-semibold text-text-primary">
              Snapshot na Deteccao
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!!(ctx.climate && typeof ctx.climate === 'object') && (
              <ContextItem
                icon={<Thermometer size={14} />}
                label="Temperatura max"
                value={
                  (ctx.climate as Record<string, unknown>).max_temp != null
                    ? `${(ctx.climate as Record<string, number>).max_temp}°C`
                    : '—'
                }
              />
            )}
            {!!(ctx.climate && typeof ctx.climate === 'object') && (
              <ContextItem
                icon={<Droplet size={14} />}
                label="Umidade min"
                value={
                  (ctx.climate as Record<string, unknown>).min_humidity != null
                    ? `${(ctx.climate as Record<string, number>).min_humidity}%`
                    : '—'
                }
              />
            )}
            {typeof ctx.fire_count === 'number' && (
              <ContextItem
                icon={<Shield size={14} />}
                label="Focos 24h"
                value={String(ctx.fire_count)}
              />
            )}
            {typeof ctx.dengue_level === 'number' && ctx.dengue_level > 0 && (
              <ContextItem
                icon={<Shield size={14} />}
                label="Dengue nivel"
                value={String(ctx.dengue_level)}
              />
            )}
            {typeof ctx.irtc_score === 'number' && (
              <ContextItem
                icon={<Shield size={14} />}
                label="IRTC"
                value={ctx.irtc_score.toFixed(1)}
              />
            )}
            {typeof ctx.aqi === 'number' && (
              <ContextItem
                icon={<Activity size={14} />}
                label="AQI"
                value={String(ctx.aqi)}
              />
            )}
            {!!ctx.detected_by && (
              <ContextItem
                icon={<Activity size={14} />}
                label="Detectado por"
                value={String(ctx.detected_by)}
              />
            )}
          </div>
        </div>
      )}

      {/* Affected population if known */}
      {incident.affected_population && (
        <div className={cn(
          'p-3 rounded-lg border',
          'bg-orange-500/10 border-orange-500/20',
        )}>
          <p className="text-xs text-orange-400 font-medium">
            Populacao estimada afetada: {incident.affected_population.toLocaleString('pt-BR')}
          </p>
        </div>
      )}
    </div>
  )
}

function ContextItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  )
}
