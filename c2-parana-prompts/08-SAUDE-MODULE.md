# 08 — SAUDE MODULE: Módulo de Saúde

## Descrição
Implementa o módulo de saúde com dados InfoDengue (alertas semanais por município), OpenDataSUS (leitos/CNES), mapa coroplético de dengue por município, KPI cards e tabela de municípios em alerta com série temporal semanal.

## Pré-requisitos
- Prompts 01–05 concluídos
- Dados de dengue populados no Supabase (pelo cron do prompt 11, ou manualmente)

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo de Saúde do C2 Paraná com InfoDengue e OpenDataSUS. Execute todos os passos.

## PASSO 1: Criar src/types/saude.ts

```typescript
// src/types/saude.ts
export interface DengueData {
  id: string
  ibge_code: string
  municipality_name: string | null
  epidemiological_week: number
  year: number
  cases: number
  cases_est: number | null
  alert_level: 0 | 1 | 2 | 3
  incidence_rate: number | null
  population: number | null
  fetched_at: string
}

export interface SaudeKpis {
  total_casos_semana: number
  municipios_alerta: number
  municipios_epidemia: number
  semana_epidemiologica: number
  variacao_semana: number
  total_leitos_sus?: number
  cobertura_vacinal?: number
}

export const DENGUE_ALERT_CONFIG = {
  0: { color: '#10b981', label: 'Verde', description: 'Sem alerta', textColor: 'text-status-success' },
  1: { color: '#f59e0b', label: 'Amarelo', description: 'Alerta leve', textColor: 'text-status-warning' },
  2: { color: '#f97316', label: 'Laranja', description: 'Alerta moderado', textColor: 'text-orange-400' },
  3: { color: '#ef4444', label: 'Vermelho', description: 'Epidemia', textColor: 'text-status-danger' },
} as const

// Geocodes IBGE dos municípios PR: formato 410XXXX (começa com 41)
export function isPRMunicipality(ibge: string): boolean {
  return ibge.startsWith('41')
}
```

## PASSO 2: Criar src/hooks/useSaude.ts

```typescript
// src/hooks/useSaude.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DengueData, SaudeKpis } from '@/types/saude'

export function useDengueAtual() {
  return useQuery({
    queryKey: ['dengue-atual'],
    queryFn: async () => {
      // Buscar última semana epidemiológica disponível
      const { data: latest } = await supabase
        .from('dengue_data')
        .select('year, epidemiological_week')
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .single()

      if (!latest) return []

      const { data } = await supabase
        .from('dengue_data')
        .select('*')
        .eq('year', latest.year)
        .eq('epidemiological_week', latest.epidemiological_week)
        .order('cases', { ascending: false })

      return (data || []) as DengueData[]
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useDengueSerie(ibgeCode?: string, semanas = 12) {
  return useQuery({
    queryKey: ['dengue-serie', ibgeCode, semanas],
    queryFn: async () => {
      let query = supabase
        .from('dengue_data')
        .select('ibge_code, municipality_name, epidemiological_week, year, cases, alert_level')
        .order('year', { ascending: true })
        .order('epidemiological_week', { ascending: true })
        .limit(semanas * (ibgeCode ? 1 : 399))

      if (ibgeCode) {
        query = query.eq('ibge_code', ibgeCode)
      }

      const { data } = await query
      return data || []
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useSaudeKpis() {
  return useQuery({
    queryKey: ['saude-kpis'],
    queryFn: async () => {
      // Calcular KPIs dos dados de dengue mais recentes
      const { data: latest } = await supabase
        .from('dengue_data')
        .select('year, epidemiological_week')
        .order('year', { ascending: false })
        .order('epidemiological_week', { ascending: false })
        .limit(1)
        .single()

      if (!latest) return null

      const { data: current } = await supabase
        .from('dengue_data')
        .select('cases, alert_level')
        .eq('year', latest.year)
        .eq('epidemiological_week', latest.epidemiological_week)

      const prevWeek = latest.epidemiological_week > 1
        ? latest.epidemiological_week - 1
        : 52

      const { data: previous } = await supabase
        .from('dengue_data')
        .select('cases')
        .eq('year', latest.epidemiological_week > 1 ? latest.year : latest.year - 1)
        .eq('epidemiological_week', prevWeek)

      const totalCasos = current?.reduce((s, d) => s + (d.cases || 0), 0) || 0
      const totalCasosAnterior = previous?.reduce((s, d) => s + (d.cases || 0), 0) || 0
      const municipiosAlerta = current?.filter(d => (d.alert_level || 0) >= 1).length || 0
      const municipiosEpidemia = current?.filter(d => (d.alert_level || 0) >= 3).length || 0
      const variacaoSemana = totalCasosAnterior > 0
        ? ((totalCasos - totalCasosAnterior) / totalCasosAnterior) * 100
        : 0

      // Buscar KPIs de leitos do data_cache
      const { data: leitosCached } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'leitos_sus_pr')
        .single()

      return {
        total_casos_semana: totalCasos,
        municipios_alerta: municipiosAlerta,
        municipios_epidemia: municipiosEpidemia,
        semana_epidemiologica: latest.epidemiological_week,
        variacao_semana: variacaoSemana,
        total_leitos_sus: (leitosCached?.data as any)?.total_leitos || null,
      } as SaudeKpis
    },
    staleTime: 1000 * 60 * 60,
  })
}

export function useLeitosSUS() {
  return useQuery({
    queryKey: ['leitos-sus'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'leitos_sus_pr')
        .single()
      return data?.data as {
        total_leitos: number
        leitos_uti: number
        ocupacao_uti_pct?: number
        data_referencia: string
      } | null
    },
    staleTime: 1000 * 60 * 60 * 24,
  })
}
```

## PASSO 3: Criar src/components/saude/DengueMapaCoroplético.tsx

```typescript
// src/components/saude/DengueMapaCoro.tsx
import { useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { useDengueAtual } from '@/hooks/useSaude'
import { DENGUE_ALERT_CONFIG } from '@/types/saude'
import type { Feature } from 'geojson'
import 'leaflet/dist/leaflet.css'

const PR_CENTER: [number, number] = [-24.89, -51.55]
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

export function DengueMapaCoro() {
  const { data: dengueData } = useDengueAtual()

  const { data: geoJSON } = useQuery({
    queryKey: ['municipios-geojson-saude'],
    queryFn: async () => {
      const res = await fetch('/data/municipios-pr.geojson')
      if (!res.ok) {
        const r2 = await fetch('https://servicodados.ibge.gov.br/api/v2/malhas/41/?resolucao=5&formato=application/vnd.geo+json')
        return r2.json()
      }
      return res.json()
    },
    staleTime: Infinity,
  })

  const dengueMap = useMemo(() => {
    const map = new Map<string, number>()
    dengueData?.forEach(d => map.set(d.ibge_code, d.alert_level))
    return map
  }, [dengueData])

  const getStyle = (feature?: Feature) => {
    const ibge = String(feature?.properties?.CD_MUN || feature?.properties?.geocodigo || '')
    const level = dengueMap.get(ibge) || 0
    const config = DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG]
    return {
      fillColor: config.color,
      fillOpacity: 0.55,
      color: '#374151',
      weight: 0.6,
    }
  }

  return (
    <div className="card overflow-hidden" style={{ height: 400 }}>
      <MapContainer
        center={PR_CENTER}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer url={DARK_TILE} attribution="" />
        {geoJSON && <GeoJSON key="dengue-coro" data={geoJSON} style={getStyle} />}
      </MapContainer>

      {/* Legenda inline */}
      <div className="absolute bottom-3 left-3 bg-background-card/90 rounded p-2 flex gap-3">
        {Object.entries(DENGUE_ALERT_CONFIG).map(([level, config]) => (
          <div key={level} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
            <span className="text-2xs text-text-secondary">{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

## PASSO 4: Criar src/components/saude/AlertasMunicipios.tsx

```typescript
// src/components/saude/AlertasMunicipios.tsx
import { useState } from 'react'
import { useDengueAtual } from '@/hooks/useSaude'
import { DENGUE_ALERT_CONFIG } from '@/types/saude'

type SortKey = 'cases' | 'alert_level' | 'municipality_name'

export function AlertasMunicipios() {
  const [sortKey, setSortKey] = useState<SortKey>('cases')
  const [filter, setFilter] = useState<number | null>(null)
  const { data: dengueData, isLoading } = useDengueAtual()

  const sorted = [...(dengueData || [])]
    .filter(d => filter === null || d.alert_level === filter)
    .sort((a, b) => {
      if (sortKey === 'municipality_name') return (a.municipality_name || '').localeCompare(b.municipality_name || '')
      return (b[sortKey] || 0) - (a[sortKey] || 0)
    })

  const alertaCountByLevel = dengueData?.reduce((acc, d) => {
    acc[d.alert_level] = (acc[d.alert_level] || 0) + 1
    return acc
  }, {} as Record<number, number>) || {}

  return (
    <div className="card">
      {/* Filtros */}
      <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter(null)} className={`text-xs px-3 py-1 rounded-full border transition-all ${filter === null ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-border text-text-secondary'}`}>
          Todos ({dengueData?.length || 0})
        </button>
        {[3, 2, 1, 0].map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${filter === level ? 'border-current bg-current/10' : 'border-border text-text-secondary'}`}
            style={{ color: filter === level ? DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG].color : undefined }}
          >
            {DENGUE_ALERT_CONFIG[level as keyof typeof DENGUE_ALERT_CONFIG].label} ({alertaCountByLevel[level] || 0})
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="overflow-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background-card">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('municipality_name')}>Município</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('cases')}>Casos</th>
              <th className="text-center py-2 px-4 text-text-muted text-xs font-medium cursor-pointer hover:text-text-primary" onClick={() => setSortKey('alert_level')}>Alerta</th>
              <th className="text-right py-2 px-4 text-text-muted text-xs font-medium">Inc./100k</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td colSpan={4} className="py-2 px-4"><div className="h-3 bg-background-elevated rounded w-full animate-pulse" /></td>
                </tr>
              ))
            ) : (
              sorted.slice(0, 50).map(d => {
                const config = DENGUE_ALERT_CONFIG[d.alert_level as keyof typeof DENGUE_ALERT_CONFIG]
                return (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                    <td className="py-2 px-4 text-text-primary text-xs">{d.municipality_name || d.ibge_code}</td>
                    <td className="py-2 px-4 text-right font-mono text-xs font-semibold text-text-primary">{d.cases}</td>
                    <td className="py-2 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-2xs font-medium" style={{ color: config.color }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-2xs text-text-muted font-mono">
                      {d.incidence_rate?.toFixed(1) || '—'}
                    </td>
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

## PASSO 5: Criar src/components/saude/DengueSerieTemporal.tsx

```typescript
// src/components/saude/DengueSerieTemporal.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useDengueSerie } from '@/hooks/useSaude'

export function DengueSerieTemporal() {
  const { data: serie, isLoading } = useDengueSerie(undefined, 12)

  // Agrupar por semana
  const byWeek = serie?.reduce((acc, d) => {
    const key = `${d.year}-SE${String(d.epidemiological_week).padStart(2, '0')}`
    if (!acc[key]) acc[key] = { week: key, total: 0, municipios: 0 }
    acc[key].total += d.cases || 0
    acc[key].municipios += 1
    return acc
  }, {} as Record<string, { week: string; total: number; municipios: number }>)

  const chartData = Object.values(byWeek || {}).slice(-16)

  if (isLoading) return <div className="h-40 bg-background-elevated rounded animate-pulse" />

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">Casos de Dengue — PR (semanas epidemiológicas)</p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="dengueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="week" tick={{ fill: '#4b5563', fontSize: 9 }} tickLine={false} interval={2} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
          />
          <Area type="monotone" dataKey="total" name="Casos" stroke="#f59e0b" fill="url(#dengueGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

## PASSO 6: Criar src/pages/SaudePage.tsx (completo)

```typescript
// src/pages/SaudePage.tsx
import { useSaudeKpis, useLeitosSUS } from '@/hooks/useSaude'
import { DengueMapaCoro } from '@/components/saude/DengueMapaCoro'
import { AlertasMunicipios } from '@/components/saude/AlertasMunicipios'
import { DengueSerieTemporal } from '@/components/saude/DengueSerieTemporal'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { formatNumber, formatPercent } from '@/lib/utils'

export function SaudePage() {
  const { isPro } = useAuth()
  const { data: kpis, isLoading } = useSaudeKpis()
  const { data: leitos } = useLeitosSUS()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Saúde" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Saúde</h1>
        <p className="text-text-secondary text-sm mt-1">
          InfoDengue · OpenDataSUS · SE {kpis?.semana_epidemiologica || '—'}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Casos Dengue (semana)"
          value={kpis ? formatNumber(kpis.total_casos_semana) : '—'}
          trend={kpis?.variacao_semana}
          accentColor={kpis && kpis.variacao_semana > 20 ? 'red' : 'yellow'}
          loading={isLoading}
        />
        <KpiCard
          label="Municípios em alerta"
          value={kpis ? kpis.municipios_alerta : '—'}
          subvalue={`${kpis?.municipios_epidemia || 0} em epidemia`}
          accentColor={kpis && kpis.municipios_epidemia > 0 ? 'red' : 'yellow'}
          loading={isLoading}
        />
        <KpiCard
          label="Leitos SUS PR"
          value={leitos ? formatNumber(leitos.total_leitos) : '—'}
          subvalue={leitos?.total_leitos_uti ? `${formatNumber(leitos.total_leitos_uti)} UTI` : undefined}
          accentColor="blue"
        />
        <KpiCard
          label="Ocupação UTI"
          value={leitos?.ocupacao_uti_pct ? `${leitos.ocupacao_uti_pct.toFixed(0)}%` : '—'}
          accentColor={leitos?.ocupacao_uti_pct && leitos.ocupacao_uti_pct > 80 ? 'red' : 'green'}
        />
      </div>

      {/* Grid: Mapa + Série temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary moduleName="mapa dengue">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Dengue por Município</h2>
            <DengueMapaCoro />
          </div>
        </ErrorBoundary>
        <ErrorBoundary moduleName="série temporal dengue">
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Evolução Semanal</h2>
            <DengueSerieTemporal />
          </div>
        </ErrorBoundary>
      </div>

      {/* Tabela de alertas */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Municípios com Alertas</h2>
        <ErrorBoundary moduleName="alertas municípios">
          <AlertasMunicipios />
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
├── types/saude.ts                        (CRIADO)
├── hooks/useSaude.ts                     (CRIADO)
├── components/saude/
│   ├── DengueMapaCoro.tsx                (CRIADO)
│   ├── AlertasMunicipios.tsx             (CRIADO)
│   └── DengueSerieTemporal.tsx           (CRIADO)
└── pages/SaudePage.tsx                   (SUBSTITUÍDO)
```

---

## Verificação

1. Navegar para `/saude` → ver KPIs e mapa coroplético
2. Mapa: municípios coloridos de verde/amarelo/laranja/vermelho conforme alerta dengue
3. Tabela: clicar em cabeçalhos para ordenar; filtros por nível de alerta
4. Gráfico de série temporal mostra picos sazonais
5. Sem dados no Supabase → estado vazio elegante (sem crashes)

---

## Notas Técnicas

- **InfoDengue geocodes**: Municípios do PR têm geocode IBGE no formato `410XXXX`. O ETL deve buscar todos os municípios com `geocode` começando com `41`.
- **Semana epidemiológica**: A SE atual pode ser consultada em `https://info.dengue.mat.br/api/alertcity?geocode=4106902&disease=dengue&format=json` — o campo `SE` na resposta.
- **Leitos SUS**: Dados do CNES/OpenDataSUS são atualizados mensalmente. O ETL semanal do prompt 11 busca esses dados e salva em `data_cache` com key `leitos_sus_pr`.
- **Mapa com MapContainer adicional**: O módulo de saúde tem seu próprio `MapContainer` com interações desabilitadas (estático, apenas visual). O mapa central do prompt 05 é separado.
