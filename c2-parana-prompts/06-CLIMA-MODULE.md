# 06 — CLIMA MODULE: Módulo de Clima e Alertas Meteorológicos

## Descrição
Implementa o módulo completo de clima: widget no header com condições da estação de Curitiba, cards de condições das principais estações do PR, mapa com marcadores e overlay de alertas INMET com polígonos coloridos por severidade.

## Pré-requisitos
- Prompts 01–05 concluídos
- Dados de clima populados no Supabase (pelo cron do prompt 11, ou manualmente)
- Variáveis de ambiente do Supabase configuradas

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo completo de Clima do C2 Paraná. Execute todos os passos.

## PASSO 1: Criar src/types/clima.ts

```typescript
// src/types/clima.ts
export interface EstacaoClima {
  station_code: string
  station_name: string
  municipality: string | null
  ibge_code: string | null
  latitude: number | null
  longitude: number | null
  temperature: number | null
  humidity: number | null
  pressure: number | null
  wind_speed: number | null
  wind_direction: number | null
  precipitation: number | null
  observed_at: string
}

export interface AlertaINMET {
  id: string
  source: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string | null
  affected_area: GeoJSON.Geometry | null
  affected_municipalities: string[] | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  external_id: string | null
}

// Estações principais do PR para o widget e cards
export const ESTACOES_PRINCIPAIS: Record<string, string> = {
  'A807': 'Curitiba',
  'A834': 'Londrina',
  'A820': 'Maringá',
  'A843': 'Cascavel',
  'A847': 'Foz do Iguaçu',
  'A823': 'Ponta Grossa',
}

export function getWindDirection(degrees: number | null): string {
  if (degrees === null) return '—'
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(degrees / 45) % 8]
}

export function getWeatherCondition(temp: number | null, humidity: number | null, precipitation: number | null): string {
  if (precipitation && precipitation > 2) return '🌧 Chuva'
  if (precipitation && precipitation > 0) return '🌦 Garoa'
  if (humidity && humidity > 85) return '☁️ Nublado'
  if (humidity && humidity > 60) return '⛅ Parcialmente nublado'
  return '☀️ Ensolarado'
}

export const SEVERITY_CONFIG = {
  critical: { color: '#7f1d1d', border: '#dc2626', label: 'Crítico', badgeClass: 'badge-danger' },
  high: { color: '#7c2d12', border: '#ea580c', label: 'Alto', badgeClass: 'badge-danger' },
  medium: { color: '#78350f', border: '#d97706', label: 'Moderado', badgeClass: 'badge-warning' },
  low: { color: '#052e16', border: '#16a34a', label: 'Baixo', badgeClass: 'badge-success' },
  info: { color: '#1e3a5f', border: '#3b82f6', label: 'Informativo', badgeClass: 'badge-info' },
}
```

## PASSO 2: Criar src/hooks/useClima.ts

```typescript
// src/hooks/useClima.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EstacaoClima, AlertaINMET } from '@/types/clima'

export function useEstacoesPR() {
  return useQuery({
    queryKey: ['clima-estacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('climate_data')
        .select('*')
        .order('observed_at', { ascending: false })

      if (error) throw error

      // Deduplicate: última leitura por estação
      const seen = new Set<string>()
      const unique: EstacaoClima[] = []
      for (const row of data || []) {
        if (!seen.has(row.station_code)) {
          seen.add(row.station_code)
          unique.push(row as EstacaoClima)
        }
      }
      return unique
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
  })
}

export function useEstacaoCuritiba() {
  return useQuery({
    queryKey: ['clima-curitiba'],
    queryFn: async () => {
      const { data } = await supabase
        .from('climate_data')
        .select('*')
        .eq('station_code', 'A807')
        .order('observed_at', { ascending: false })
        .limit(1)
        .single()
      return data as EstacaoClima | null
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 30,
  })
}

export function useAlertasINMET() {
  return useQuery({
    queryKey: ['alertas-inmet'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('source', 'inmet')
        .eq('is_active', true)
        .order('starts_at', { ascending: false })
      if (error) throw error
      return (data || []) as AlertaINMET[]
    },
    staleTime: 1000 * 60 * 15,
    refetchInterval: 1000 * 60 * 30,
  })
}

export function useHistoricoClima(stationCode: string, days = 7) {
  return useQuery({
    queryKey: ['clima-historico', stationCode, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('climate_data')
        .select('temperature, humidity, precipitation, observed_at')
        .eq('station_code', stationCode)
        .gte('observed_at', since)
        .order('observed_at', { ascending: true })
      return data || []
    },
    staleTime: 1000 * 60 * 30,
  })
}
```

## PASSO 3: Criar src/components/clima/ClimaWidget.tsx (widget do header)

```typescript
// src/components/clima/ClimaWidget.tsx
import { useEstacaoCuritiba } from '@/hooks/useClima'
import { getWeatherCondition } from '@/types/clima'

export function ClimaWidget() {
  const { data: curitiba, isLoading } = useEstacaoCuritiba()

  if (isLoading) {
    return <div className="hidden lg:flex items-center gap-2 animate-pulse">
      <div className="h-4 w-20 bg-background-elevated rounded" />
    </div>
  }

  if (!curitiba) return null

  const condition = getWeatherCondition(curitiba.temperature, curitiba.humidity, curitiba.precipitation)

  return (
    <div className="hidden lg:flex items-center gap-2 text-xs border-r border-border pr-4 mr-2">
      <span className="text-base leading-none">{condition.split(' ')[0]}</span>
      <div>
        <span className="font-mono font-semibold text-text-primary text-sm">
          {curitiba.temperature?.toFixed(1)}°C
        </span>
        <span className="text-text-muted ml-1">CWB</span>
      </div>
      <span className="text-text-muted">|</span>
      <span className="text-text-secondary">{curitiba.humidity?.toFixed(0)}%</span>
    </div>
  )
}
```

Adicione `<ClimaWidget />` no Header.tsx, antes do Clock.

## PASSO 4: Criar src/components/clima/EstacaoCard.tsx

```typescript
// src/components/clima/EstacaoCard.tsx
import type { EstacaoClima } from '@/types/clima'
import { getWeatherCondition, getWindDirection } from '@/types/clima'
import { timeAgo } from '@/lib/utils'

interface EstacaoCardProps {
  estacao: EstacaoClima
}

export function EstacaoCard({ estacao }: EstacaoCardProps) {
  const condition = getWeatherCondition(estacao.temperature, estacao.humidity, estacao.precipitation)

  return (
    <div className="card p-4 hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{estacao.station_name}</h3>
          <p className="text-2xs text-text-muted font-mono">{estacao.station_code}</p>
        </div>
        <span className="text-xl leading-none">{condition.split(' ')[0]}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-mono font-bold text-text-primary leading-none">
            {estacao.temperature?.toFixed(1) ?? '—'}°
          </p>
          <p className="text-2xs text-text-muted mt-0.5">Temperatura</p>
        </div>
        <div>
          <p className="text-base font-mono font-semibold text-accent-blue">
            {estacao.humidity?.toFixed(0) ?? '—'}%
          </p>
          <p className="text-2xs text-text-muted">Umidade</p>
        </div>
        <div>
          <p className="text-base font-mono font-semibold text-text-secondary">
            {estacao.wind_speed?.toFixed(1) ?? '—'}<span className="text-xs font-normal"> m/s</span>
          </p>
          <p className="text-2xs text-text-muted">{getWindDirection(estacao.wind_direction)}</p>
        </div>
      </div>

      {(estacao.precipitation ?? 0) > 0 && (
        <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5">
          <span className="text-accent-blue text-xs">🌧</span>
          <span className="text-xs text-accent-blue font-mono">{estacao.precipitation?.toFixed(1)} mm/h</span>
        </div>
      )}

      <p className="text-2xs text-text-muted mt-2">
        Atualizado {timeAgo(estacao.observed_at)}
      </p>
    </div>
  )
}
```

## PASSO 5: Criar src/components/clima/AlertaCard.tsx

```typescript
// src/components/clima/AlertaCard.tsx
import type { AlertaINMET } from '@/types/clima'
import { SEVERITY_CONFIG } from '@/types/clima'
import { formatDateTime } from '@/lib/utils'

interface AlertaCardProps {
  alerta: AlertaINMET
}

export function AlertaCard({ alerta }: AlertaCardProps) {
  const config = SEVERITY_CONFIG[alerta.severity]

  return (
    <div
      className="card p-4 border-l-2"
      style={{ borderLeftColor: config.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={config.badgeClass}>{config.label}</span>
            {alerta.is_active && (
              <span className="badge-success text-2xs">Ativo</span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-text-primary leading-tight">{alerta.title}</h4>
          {alerta.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{alerta.description}</p>
          )}
        </div>
      </div>

      {alerta.affected_municipalities && alerta.affected_municipalities.length > 0 && (
        <p className="text-2xs text-text-muted mt-2">
          {alerta.affected_municipalities.length} município(s) afetado(s)
        </p>
      )}

      <div className="flex items-center gap-3 mt-2 text-2xs text-text-muted">
        {alerta.starts_at && <span>Início: {formatDateTime(alerta.starts_at)}</span>}
        {alerta.ends_at && <span>Fim: {formatDateTime(alerta.ends_at)}</span>}
      </div>
    </div>
  )
}
```

## PASSO 6: Criar src/components/clima/TempoSerieChart.tsx

```typescript
// src/components/clima/TempoSerieChart.tsx
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useHistoricoClima } from '@/hooks/useClima'
import { Skeleton } from '@/components/ui/SkeletonCard'

interface TempoSerieChartProps {
  stationCode: string
  stationName: string
}

export function TempoSerieChart({ stationCode, stationName }: TempoSerieChartProps) {
  const { data, isLoading } = useHistoricoClima(stationCode, 7)

  if (isLoading) return <Skeleton className="h-40 w-full" />

  const chartData = (data || []).map(d => ({
    time: format(new Date(d.observed_at), 'dd/MM HH:mm', { locale: ptBR }),
    temp: d.temperature,
    hum: d.humidity,
    prec: d.precipitation,
  }))

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3">Temperatura — {stationName} (7 dias)</p>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#4b5563', fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            itemStyle={{ color: '#f9fafb', fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="temp"
            name="Temp (°C)"
            stroke="#3b82f6"
            fill="url(#tempGrad)"
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

## PASSO 7: Criar src/pages/ClimaPage.tsx (completo)

```typescript
// src/pages/ClimaPage.tsx
import { useState } from 'react'
import { useEstacoesPR, useAlertasINMET } from '@/hooks/useClima'
import { EstacaoCard } from '@/components/clima/EstacaoCard'
import { AlertaCard } from '@/components/clima/AlertaCard'
import { TempoSerieChart } from '@/components/clima/TempoSerieChart'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { ESTACOES_PRINCIPAIS } from '@/types/clima'

export function ClimaPage() {
  const [selectedStation, setSelectedStation] = useState('A807')
  const { data: estacoes, isLoading: loadingEstacoes } = useEstacoesPR()
  const { data: alertas, isLoading: loadingAlertas } = useAlertasINMET()

  const principaisEstacoes = (estacoes || []).filter(e =>
    Object.keys(ESTACOES_PRINCIPAIS).includes(e.station_code)
  )

  const alertasAtivos = (alertas || []).filter(a => a.is_active)
  const avgTemp = estacoes?.length
    ? (estacoes.reduce((s, e) => s + (e.temperature || 0), 0) / estacoes.length).toFixed(1)
    : '—'

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Clima</h1>
          <p className="text-text-secondary text-sm mt-1">Estações INMET no Paraná · Atualização a cada 30 minutos</p>
        </div>
        <LiveIndicator />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Estações ativas" value={estacoes?.length ?? '—'} accentColor="blue" loading={loadingEstacoes} />
        <KpiCard label="Temp. média PR" value={`${avgTemp}°C`} accentColor="blue" loading={loadingEstacoes} />
        <KpiCard label="Alertas ativos" value={alertasAtivos.length} accentColor={alertasAtivos.length > 0 ? 'red' : 'green'} loading={loadingAlertas} />
        <KpiCard label="Cobertura" value="~20 estações" accentColor="green" />
      </div>

      {/* Alertas INMET */}
      {alertasAtivos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            ⚠️ Alertas Meteorológicos Ativos
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {alertasAtivos.map(alerta => (
              <ErrorBoundary key={alerta.id} moduleName="alerta card">
                <AlertaCard alerta={alerta} />
              </ErrorBoundary>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico histórico */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Histórico de Temperatura
          </h2>
          <select
            value={selectedStation}
            onChange={e => setSelectedStation(e.target.value)}
            className="input-field text-xs w-auto"
          >
            {Object.entries(ESTACOES_PRINCIPAIS).map(([code, name]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
        </div>
        <ErrorBoundary moduleName="gráfico clima">
          <TempoSerieChart
            stationCode={selectedStation}
            stationName={ESTACOES_PRINCIPAIS[selectedStation] || selectedStation}
          />
        </ErrorBoundary>
      </div>

      {/* Cards das estações principais */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Estações Principais
        </h2>
        {loadingEstacoes ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse space-y-3">
                <div className="h-4 bg-background-elevated rounded w-32" />
                <div className="h-8 bg-background-elevated rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {principaisEstacoes.map(estacao => (
              <button
                key={estacao.station_code}
                onClick={() => setSelectedStation(estacao.station_code)}
                className="text-left"
              >
                <EstacaoCard estacao={estacao} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Todas as estações */}
      {(estacoes?.length ?? 0) > 6 && (
        <details className="group">
          <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary list-none flex items-center gap-2">
            <svg className="w-4 h-4 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Ver todas as {estacoes?.length} estações
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
            {estacoes?.filter(e => !Object.keys(ESTACOES_PRINCIPAIS).includes(e.station_code)).map(estacao => (
              <EstacaoCard key={estacao.station_code} estacao={estacao} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
```
```

---

## Arquivos Criados/Modificados

```
src/
├── types/clima.ts                        (CRIADO)
├── hooks/useClima.ts                     (CRIADO)
├── components/clima/
│   ├── ClimaWidget.tsx                   (CRIADO — add ao Header.tsx)
│   ├── EstacaoCard.tsx                   (CRIADO)
│   ├── AlertaCard.tsx                    (CRIADO)
│   └── TempoSerieChart.tsx               (CRIADO)
└── pages/ClimaPage.tsx                   (SUBSTITUÍDO)
```

---

## Verificação

1. Navegar para `/clima` → ver KPIs, cards de estações e gráfico de temperatura
2. Header deve mostrar temperatura de Curitiba (após dados serem populados pelo cron)
3. Se houver alertas ativos no banco → aparecem na seção de alertas
4. Selecionar estação diferente no dropdown → gráfico atualiza
5. `refetchInterval: 1800000` → dados atualizam automaticamente a cada 30min

---

## Notas Técnicas

- **Dados mockados para desenvolvimento**: Enquanto o cron não estiver rodando, insira dados manualmente no Supabase (Table Editor → climate_data) para testar o módulo.
- **INMET API diretamente no browser**: A INMET API não tem CORS configurado para uso direto no browser — os dados DEVEM ser buscados pelo ETL do servidor (GitHub Actions) e salvos no Supabase. Não tente chamar a API INMET diretamente do React.
- **ClimaWidget no Header**: Adicionar `<ClimaWidget />` no src/components/layout/Header.tsx, logo antes do `<Clock />`.
- **Estações PR**: Os códigos INMET para o Paraná variam de A807 (Curitiba) a A869. O ETL vai buscar as estações automaticamente. Os 6 códigos em `ESTACOES_PRINCIPAIS` são apenas para destaque visual.
