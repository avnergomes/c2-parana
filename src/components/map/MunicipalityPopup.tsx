// src/components/map/MunicipalityPopup.tsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useVbpMunicipios } from '@/hooks/useAgro'

interface ClimaMuniData {
  temperature: number | null
  humidity: number | null
  wind_speed: number | null
  precipitation: number | null
  observed_at: string | null
}

interface DengueMuniData {
  cases: number | null
  alert_level: number | null
  epidemiological_week: number | null
  year: number | null
}

interface MunicipalityPopupProps {
  ibgeCode: string
  name: string
  onClose: () => void
}

const DENGUE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444']
const DENGUE_LABELS = ['Normal', 'Alerta', 'Moderado', 'Epidemia']

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(0)}M`
  return `R$ ${(value / 1_000).toFixed(0)}K`
}

export function MunicipalityPopup({ ibgeCode, name, onClose }: MunicipalityPopupProps) {
  // Clima
  const { data: climaData, isLoading: loadingClima } = useQuery({
    queryKey: ['muni-clima', ibgeCode],
    queryFn: async () => {
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, humidity, wind_speed, precipitation, observed_at')
        .eq('ibge_code', ibgeCode)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as ClimaMuniData | null
    },
    staleTime: 1000 * 60 * 10,
  })

  // Dengue
  const { data: dengueData } = useQuery({
    queryKey: ['muni-dengue', ibgeCode],
    queryFn: async () => {
      const { data } = await supabase
        .from('dengue_data')
        .select('cases, alert_level, epidemiological_week, year')
        .eq('ibge_code', ibgeCode)
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as DengueMuniData | null
    },
  })

  // Focos de calor
  const { data: fireCount } = useQuery({
    queryKey: ['muni-fires', ibgeCode],
    queryFn: async () => {
      const { count } = await supabase
        .from('fire_spots')
        .select('*', { count: 'exact', head: true })
        .eq('ibge_code', ibgeCode)
        .gte('acq_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      return count || 0
    },
    staleTime: 1000 * 60 * 10,
  })

  // VBP (from cached hook data — no extra query)
  const { data: vbpMunicipios } = useVbpMunicipios()
  const vbpEntry = vbpMunicipios?.find(m => m.ibge_code === ibgeCode)

  const hasClima = !!climaData
  const hasDengue = !!dengueData
  const hasFires = (fireCount ?? 0) > 0
  const hasVbp = !!vbpEntry
  const isEmpty = !hasClima && !hasDengue && !hasFires && !hasVbp && !loadingClima

  return (
    <div className="absolute top-4 right-4 z-[1000] card p-4 w-72 shadow-card-hover animate-slide-in border border-border/50">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary leading-tight">{name}</h3>
          <p className="text-2xs text-text-muted font-mono mt-0.5">IBGE {ibgeCode}</p>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-lg leading-none ml-2 -mt-0.5 w-6 h-6 flex items-center justify-center rounded hover:bg-background-elevated transition-colors"
        >
          ×
        </button>
      </div>

      {loadingClima && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-background-elevated rounded w-24" />
          <div className="h-8 bg-background-elevated rounded" />
        </div>
      )}

      {isEmpty && !loadingClima && (
        <p className="text-xs text-text-muted py-2">Sem dados disponíveis para este município.</p>
      )}

      <div className="space-y-3">
        {/* Clima */}
        {hasClima && (
          <div>
            <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Clima</p>
            <div className="grid grid-cols-4 gap-1">
              <div className="text-center">
                <p className="text-sm font-mono font-bold text-text-primary">
                  {climaData.temperature?.toFixed(1) ?? '—'}°
                </p>
                <p className="text-2xs text-text-muted">Temp</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-bold text-text-primary">
                  {climaData.humidity?.toFixed(0) ?? '—'}%
                </p>
                <p className="text-2xs text-text-muted">Umid</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-bold text-text-primary">
                  {climaData.wind_speed?.toFixed(1) ?? '—'}
                </p>
                <p className="text-2xs text-text-muted">m/s</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-bold text-text-primary">
                  {climaData.precipitation?.toFixed(1) ?? '—'}
                </p>
                <p className="text-2xs text-text-muted">mm</p>
              </div>
            </div>
          </div>
        )}

        {/* Dengue */}
        {hasDengue && (
          <div>
            <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1.5">Dengue</p>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: DENGUE_COLORS[dengueData.alert_level || 0] }}
              />
              <span className="text-xs font-medium" style={{ color: DENGUE_COLORS[dengueData.alert_level || 0] }}>
                {DENGUE_LABELS[dengueData.alert_level || 0]}
              </span>
              <span className="text-xs text-text-secondary">
                {dengueData.cases?.toLocaleString('pt-BR')} casos
              </span>
            </div>
            <p className="text-2xs text-text-muted mt-0.5 font-mono">
              SE{dengueData.epidemiological_week}/{dengueData.year}
            </p>
          </div>
        )}

        {/* Focos de calor */}
        {hasFires && (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-danger flex-shrink-0" />
            <span className="text-xs text-text-secondary">
              <span className="font-mono font-bold text-status-danger">{fireCount}</span> focos de calor (7d)
            </span>
          </div>
        )}

        {/* VBP */}
        {hasVbp && (
          <div>
            <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1">VBP Agro</p>
            <p className="text-sm font-mono font-bold text-accent-green">
              {formatCurrency(vbpEntry.vbp_total)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
