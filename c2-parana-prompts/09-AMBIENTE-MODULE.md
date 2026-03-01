# 09 — AMBIENTE MODULE: Módulo Meio Ambiente

## Descrição
Implementa o módulo de meio ambiente com focos de calor NASA FIRMS, nível de rios ANA Telemetria, qualidade do ar AQICN para as 4 principais cidades do PR, mapa combinado e trend chart dos últimos 30 dias.

## Pré-requisitos
- Prompts 01–05 concluídos
- Chaves de API: NASA FIRMS, WAQI/AQICN
- Dados populados no Supabase pelos crons (ou inserção manual para teste)

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_WAQI_TOKEN=demo    # ou token real de waqi.info
VITE_NASA_FIRMS_KEY=DEMO_KEY  # ou chave real do NASA FIRMS
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo de Meio Ambiente do C2 Paraná. Execute todos os passos.

## PASSO 1: Criar src/types/ambiente.ts

```typescript
// src/types/ambiente.ts
export interface FireSpot {
  id: string
  latitude: number
  longitude: number
  brightness: number | null
  acq_date: string
  satellite: string | null
  confidence: string | null
  municipality: string | null
  ibge_code: string | null
}

export interface RiverLevel {
  id: string
  station_code: string
  station_name: string
  river_name: string | null
  municipality: string | null
  latitude: number | null
  longitude: number | null
  level_cm: number | null
  flow_m3s: number | null
  alert_level: 'normal' | 'attention' | 'alert' | 'emergency'
  observed_at: string
}

export interface AirQualityData {
  id: string
  city: string
  station_name: string | null
  aqi: number | null
  dominant_pollutant: string | null
  pm25: number | null
  pm10: number | null
  observed_at: string
}

export const AQI_CONFIG = {
  good: { range: [0, 50], color: '#10b981', label: 'Boa', description: 'Qualidade do ar satisfatória' },
  moderate: { range: [51, 100], color: '#f59e0b', label: 'Moderada', description: 'Qualidade aceitável' },
  unhealthy_sensitive: { range: [101, 150], color: '#f97316', label: 'Ruim (sensíveis)', description: 'Grupos sensíveis podem ser afetados' },
  unhealthy: { range: [151, 200], color: '#ef4444', label: 'Ruim', description: 'Saúde de todos pode ser afetada' },
  very_unhealthy: { range: [201, 300], color: '#8b5cf6', label: 'Muito ruim', description: 'Alertas de saúde' },
  hazardous: { range: [301, 500], color: '#7f1d1d', label: 'Perigoso', description: 'Emergência de saúde' },
} as const

export function getAqiCategory(aqi: number): keyof typeof AQI_CONFIG {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'unhealthy_sensitive'
  if (aqi <= 200) return 'unhealthy'
  if (aqi <= 300) return 'very_unhealthy'
  return 'hazardous'
}

export const RIVER_ALERT_CONFIG = {
  normal: { color: '#10b981', label: 'Normal', icon: '💧' },
  attention: { color: '#f59e0b', label: 'Atenção', icon: '⚠️' },
  alert: { color: '#f97316', label: 'Alerta', icon: '🔶' },
  emergency: { color: '#ef4444', label: 'Emergência', icon: '🚨' },
}

export const CIDADES_AR = [
  { id: 'curitiba', label: 'Curitiba', waqi: 'curitiba' },
  { id: 'londrina', label: 'Londrina', waqi: 'londrina' },
  { id: 'maringa', label: 'Maringá', waqi: 'maringa' },
  { id: 'foz', label: 'Foz do Iguaçu', waqi: 'foz-do-iguacu' },
]
```

## PASSO 2: Criar src/hooks/useAmbiente.ts

```typescript
// src/hooks/useAmbiente.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FireSpot, RiverLevel, AirQualityData } from '@/types/ambiente'

export function useFireSpots(days = 7) {
  return useQuery({
    queryKey: ['fire-spots', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('fire_spots')
        .select('*')
        .gte('acq_date', since)
        .order('acq_date', { ascending: false })
        .limit(3000)
      if (error) throw error
      return (data || []) as FireSpot[]
    },
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}

export function useFireTrend(days = 30) {
  return useQuery({
    queryKey: ['fire-trend', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await supabase
        .from('fire_spots')
        .select('acq_date')
        .gte('acq_date', since)
        .order('acq_date', { ascending: true })

      // Agrupar por dia
      const byDay = (data || []).reduce((acc, spot) => {
        const day = spot.acq_date
        acc[day] = (acc[day] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      return Object.entries(byDay).map(([date, count]) => ({ date, count }))
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useRiverLevels() {
  return useQuery({
    queryKey: ['river-levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('river_levels')
        .select('*')
        .order('observed_at', { ascending: false })

      if (error) throw error

      // Deduplicate: última leitura por estação
      const seen = new Set<string>()
      return (data || []).filter(r => {
        if (seen.has(r.station_code)) return false
        seen.add(r.station_code)
        return true
      }) as RiverLevel[]
    },
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}

export function useAirQuality() {
  return useQuery({
    queryKey: ['air-quality'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('air_quality')
        .select('*')
        .order('observed_at', { ascending: false })

      if (error) throw error

      // Deduplicate: última por cidade
      const seen = new Set<string>()
      return (data || []).filter(r => {
        if (seen.has(r.city)) return false
        seen.add(r.city)
        return true
      }) as AirQualityData[]
    },
    staleTime: 1000 * 60 * 60,
    refetchInterval: 1000 * 60 * 60 * 6,
  })
}
```

## PASSO 3: Criar src/components/ambiente/QualidadeArCard.tsx

```typescript
// src/components/ambiente/QualidadeArCard.tsx
import type { AirQualityData } from '@/types/ambiente'
import { AQI_CONFIG, getAqiCategory } from '@/types/ambiente'
import { CIDADES_AR } from '@/types/ambiente'
import { timeAgo } from '@/lib/utils'
import { useAirQuality } from '@/hooks/useAmbiente'

export function QualidadeArCards() {
  const { data: aqData, isLoading } = useAirQuality()

  const byCity = CIDADES_AR.map(city => {
    const record = aqData?.find(a => a.city === city.id)
    return { ...city, record }
  })

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {byCity.map(city => {
        const aqi = city.record?.aqi
        const category = aqi !== null && aqi !== undefined ? getAqiCategory(aqi) : null
        const config = category ? AQI_CONFIG[category] : null

        return (
          <div key={city.id} className="card p-4 border-t-2" style={{ borderTopColor: config?.color || '#374151' }}>
            <p className="text-xs font-semibold text-text-secondary">{city.label}</p>
            {isLoading ? (
              <div className="animate-pulse mt-2">
                <div className="h-8 bg-background-elevated rounded w-16 mb-1" />
                <div className="h-3 bg-background-elevated rounded w-20" />
              </div>
            ) : city.record && aqi !== null ? (
              <>
                <p className="text-3xl font-mono font-bold mt-2" style={{ color: config?.color }}>
                  {aqi}
                </p>
                <p className="text-xs font-medium mt-1" style={{ color: config?.color }}>
                  {config?.label}
                </p>
                <p className="text-2xs text-text-muted mt-0.5">
                  {city.record.dominant_pollutant && `Principal: ${city.record.dominant_pollutant} · `}
                  {timeAgo(city.record.observed_at)}
                </p>
                {(city.record.pm25 || city.record.pm10) && (
                  <div className="flex gap-3 mt-2 text-2xs text-text-muted">
                    {city.record.pm25 && <span>PM2.5: {city.record.pm25.toFixed(1)}</span>}
                    {city.record.pm10 && <span>PM10: {city.record.pm10.toFixed(1)}</span>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-text-muted text-xs mt-2">Sem dados</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

## PASSO 4: Criar src/components/ambiente/FireTrendChart.tsx

```typescript
// src/components/ambiente/FireTrendChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useFireTrend } from '@/hooks/useAmbiente'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function FireTrendChart() {
  const { data, isLoading } = useFireTrend(30)

  if (isLoading) return <div className="h-40 bg-background-elevated rounded animate-pulse" />

  const chartData = (data || []).map(d => ({
    date: format(new Date(d.date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
    focos: d.count,
  }))

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">
        Focos de Calor — PR (últimos 30 dias)
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} interval={4} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            formatter={(v: number) => [v, 'Focos']}
          />
          <Bar dataKey="focos" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

## PASSO 5: Criar src/components/ambiente/RiosTable.tsx

```typescript
// src/components/ambiente/RiosTable.tsx
import { useRiverLevels } from '@/hooks/useAmbiente'
import { RIVER_ALERT_CONFIG } from '@/types/ambiente'
import { timeAgo } from '@/lib/utils'

export function RiosTable() {
  const { data: rios, isLoading } = useRiverLevels()

  const alertas = rios?.filter(r => r.alert_level !== 'normal') || []
  const normais = rios?.filter(r => r.alert_level === 'normal') || []

  return (
    <div className="card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Nível dos Rios (ANA)</h3>
        <div className="flex gap-2">
          {(['emergency', 'alert', 'attention'] as const).map(level => (
            <span key={level} className="text-2xs font-medium px-2 py-0.5 rounded-full border"
              style={{ color: RIVER_ALERT_CONFIG[level].color, borderColor: RIVER_ALERT_CONFIG[level].color + '50', background: RIVER_ALERT_CONFIG[level].color + '15' }}>
              {RIVER_ALERT_CONFIG[level].icon} {alertas.filter(r => r.alert_level === level).length}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-card">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-4 text-text-muted text-xs font-medium">Estação / Rio</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Nível</th>
              <th className="text-center py-2 px-4 text-text-muted text-xs font-medium">Status</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Atualização</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={4} className="py-2 px-4"><div className="h-3 bg-background-elevated rounded animate-pulse" /></td>
                </tr>
              ))
            ) : (
              [...alertas, ...normais].slice(0, 30).map(rio => {
                const config = RIVER_ALERT_CONFIG[rio.alert_level]
                return (
                  <tr key={rio.id} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                    <td className="py-2 px-4">
                      <p className="text-xs text-text-primary font-medium">{rio.station_name}</p>
                      {rio.river_name && <p className="text-2xs text-text-muted">{rio.river_name}</p>}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-text-primary">
                      {rio.level_cm !== null ? `${rio.level_cm.toFixed(0)} cm` : '—'}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className="text-xs" style={{ color: config.color }}>{config.icon} {config.label}</span>
                    </td>
                    <td className="py-2 px-4 text-right text-2xs text-text-muted">{timeAgo(rio.observed_at)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

## PASSO 6: Criar src/pages/AmbientePage.tsx (completo)

```typescript
// src/pages/AmbientePage.tsx
import { useFireSpots, useFireTrend, useRiverLevels, useAirQuality } from '@/hooks/useAmbiente'
import { QualidadeArCards } from '@/components/ambiente/QualidadeArCard'
import { FireTrendChart } from '@/components/ambiente/FireTrendChart'
import { RiosTable } from '@/components/ambiente/RiosTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { LiveIndicator } from '@/components/ui/LiveIndicator'

export function AmbientePage() {
  const { isPro } = useAuth()
  const { data: fires, isLoading: loadingFires } = useFireSpots(7)
  const { data: rios } = useRiverLevels()
  const { data: aqData } = useAirQuality()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Meio Ambiente" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  const riosEmAlerta = rios?.filter(r => r.alert_level !== 'normal').length || 0
  const aqiMedio = aqData?.length
    ? Math.round(aqData.reduce((s, a) => s + (a.aqi || 0), 0) / aqData.length)
    : null

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Meio Ambiente</h1>
          <p className="text-text-secondary text-sm mt-1">NASA FIRMS · ANA Telemetria · AQICN</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Focos ativos (7d)"
          value={fires?.length ?? '—'}
          accentColor={fires && fires.length > 50 ? 'red' : fires && fires.length > 10 ? 'yellow' : 'green'}
          loading={loadingFires}
        />
        <KpiCard
          label="Rios em alerta"
          value={riosEmAlerta}
          accentColor={riosEmAlerta > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="AQI médio PR"
          value={aqiMedio ?? '—'}
          accentColor={aqiMedio && aqiMedio > 100 ? 'red' : aqiMedio && aqiMedio > 50 ? 'yellow' : 'green'}
        />
        <KpiCard label="Cobertura monitoramento" value="4 cidades" accentColor="blue" />
      </div>

      {/* Qualidade do Ar */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Qualidade do Ar</h2>
        <ErrorBoundary moduleName="qualidade do ar">
          <QualidadeArCards />
        </ErrorBoundary>
      </div>

      {/* Trend de focos + Tabela de rios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary moduleName="focos de calor trend">
          <FireTrendChart />
        </ErrorBoundary>
        <ErrorBoundary moduleName="rios">
          <RiosTable />
        </ErrorBoundary>
      </div>
    </div>
  )
}
```
```

---

## Arquivos Criados/Modificados

```
src/
├── types/ambiente.ts                     (CRIADO)
├── hooks/useAmbiente.ts                  (CRIADO)
├── components/ambiente/
│   ├── QualidadeArCard.tsx               (CRIADO)
│   ├── FireTrendChart.tsx                (CRIADO)
│   └── RiosTable.tsx                     (CRIADO)
└── pages/AmbientePage.tsx                (SUBSTITUÍDO)
```

---

## Verificação

1. Navegar para `/ambiente` → KPIs, cards de qualidade do ar, gráfico de focos
2. AQI cards: 4 cidades com cor de fundo dinâmica conforme índice
3. Tabela de rios: alertas aparecem primeiro, ordenados por severidade
4. Gráfico de barras: focos de calor dos últimos 30 dias

---

## Notas Técnicas

- **NASA FIRMS DEMO_KEY**: Limita a 10 requests/IP/10min. Para produção, registrar em `firms.modaps.eosdis.nasa.gov/api/` (gratuito com conta NASA Earthdata).
- **WAQI token `demo`**: Token público com rate limit baixo. Para produção, registrar gratuitamente em `aqicn.org/data-platform/token/`.
- **ANA Telemetria**: A API `https://www.ana.gov.br/ANA_Telemetrica/api/estacoes?codEstado=41` retorna estações. Para dados de nível, usar `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos`. O ETL do prompt 11 faz esse parse.
- **Focos no mapa central**: Os `fire_spots` também são usados no mapa central (QueimadaLayer do prompt 05). Os dados são compartilhados via Supabase.
