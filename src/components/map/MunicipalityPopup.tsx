// src/components/map/MunicipalityPopup.tsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ClimaMuniData {
  temperature: number | null
  humidity: number | null
  wind_speed: number | null
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

export function MunicipalityPopup({ ibgeCode, name, onClose }: MunicipalityPopupProps) {
  // Buscar dados consolidados do município
  const { data: climaData } = useQuery({
    queryKey: ['muni-clima', ibgeCode],
    queryFn: async () => {
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, humidity, wind_speed, observed_at')
        .eq('ibge_code', ibgeCode)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as ClimaMuniData | null
    },
    staleTime: 1000 * 60 * 10,
  })

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

  const dengueColors = ['#10b981', '#f59e0b', '#f97316', '#ef4444']
  const dengueLabels = ['Normal', 'Alerta', 'Moderado', 'Epidemia']

  return (
    <div className="absolute top-4 right-4 z-[1000] card p-4 w-64 shadow-card-hover animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary leading-tight">{name}</h3>
          <p className="text-2xs text-text-muted font-mono">IBGE {ibgeCode}</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none ml-2 mt-0.5">×</button>
      </div>

      <div className="space-y-3">
        {/* Clima */}
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1">Clima</p>
          {climaData ? (
            <div className="grid grid-cols-3 gap-1">
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.temperature?.toFixed(1)}°</p>
                <p className="text-2xs text-text-muted">Temp.</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.humidity?.toFixed(0)}%</p>
                <p className="text-2xs text-text-muted">Umid.</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-mono font-semibold text-text-primary">{climaData.wind_speed?.toFixed(1)}</p>
                <p className="text-2xs text-text-muted">m/s</p>
              </div>
            </div>
          ) : (
            <p className="text-2xs text-text-muted">Sem dados de estação próxima</p>
          )}
        </div>

        {/* Dengue */}
        {dengueData && (
          <div>
            <p className="text-2xs text-text-muted uppercase tracking-wider font-semibold mb-1">Dengue</p>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dengueColors[dengueData.alert_level || 0] }}
              />
              <span className="text-xs text-text-secondary">
                {dengueLabels[dengueData.alert_level || 0]} — {dengueData.cases} casos (SE{dengueData.epidemiological_week}/{dengueData.year})
              </span>
            </div>
          </div>
        )}

        {/* Focos de calor */}
        {(fireCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-danger" />
            <span className="text-xs text-text-secondary">{fireCount} focos de calor (7 dias)</span>
          </div>
        )}
      </div>
    </div>
  )
}
