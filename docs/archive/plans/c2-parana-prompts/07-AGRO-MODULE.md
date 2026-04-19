# 07 — AGRO MODULE: Módulo Agronegócio

## Descrição
Implementa o módulo de agronegócio reutilizando dados e JSONs já processados no ecossistema Datageo Paraná: VBP, Preços Diários (SIMA/SEAB), ComexStat, Crédito Rural (BCB/SICOR) e Emprego (CAGED). KPI cards com variação YoY e mini charts sparkline.

## Pré-requisitos
- Prompts 01–04 concluídos
- Plano Pro (ou trial ativo) para acessar este módulo

## Variáveis de Ambiente
```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
# URL do backend Flask de preços (já existente no Render.com)
VITE_PRECOS_API_URL=https://sima-precos.onrender.com
```

---

## Prompt para o Claude Code

```
Vou implementar o módulo de Agronegócio do C2 Paraná reutilizando dados do Datageo. Execute todos os passos.

## PASSO 1: Criar src/types/agro.ts

```typescript
// src/types/agro.ts
export interface PrecoSIMA {
  produto: string
  variedade: string
  mercado: string
  preco_min: number
  preco_max: number
  preco_medio: number
  unidade: string
  data: string
  variacao_dia?: number
  variacao_semana?: number
}

export interface VbpMunicipio {
  ibge_code: string
  municipio: string
  vbp_total: number
  vbp_lavoura?: number
  vbp_pecuaria?: number
  ano: number
}

export interface ComexItem {
  year: number
  month?: number
  sh4_code?: string
  product_name: string
  kg: number
  usd: number
  type: 'export' | 'import'
  country?: string
}

export interface EmpregoAgro {
  year: number
  month: number
  admissoes: number
  desligamentos: number
  saldo: number
  estoque: number
}

export interface CreditoRural {
  ano_mes: string
  valor_total: number
  num_contratos: number
  produto?: string
  finalidade?: string
}

export const PRODUTOS_DESTAQUE = [
  'SOJA', 'MILHO', 'TRIGO', 'CANA-DE-AÇÚCAR', 'FRANGO', 'SUÍNO', 'CAFÉ'
]
```

## PASSO 2: Criar src/hooks/useAgro.ts

```typescript
// src/hooks/useAgro.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const PRECOS_API = import.meta.env.VITE_PRECOS_API_URL || 'https://sima-precos.onrender.com'

export function usePrecosDiarios(produto?: string) {
  return useQuery({
    queryKey: ['precos-diarios', produto],
    queryFn: async () => {
      const url = produto
        ? `${PRECOS_API}/precos?produto=${encodeURIComponent(produto)}&limit=30`
        : `${PRECOS_API}/precos?limit=50`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Falha ao buscar preços SIMA')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1h
  })
}

export function useVbpMunicipios() {
  return useQuery({
    queryKey: ['vbp-municipios'],
    queryFn: async () => {
      // Buscar JSON processado do data_cache
      const { data } = await supabase
        .from('data_cache')
        .select('data, fetched_at')
        .eq('cache_key', 'vbp_municipios_pr')
        .single()
      return data?.data || []
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}

export function useVbpKpis() {
  return useQuery({
    queryKey: ['vbp-kpis'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'vbp_kpis_pr')
        .single()
      return data?.data as {
        vbp_total_brl: number
        vbp_lavoura_brl: number
        vbp_pecuaria_brl: number
        variacao_yoy: number
        ano_referencia: number
      } | null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useComexKpis() {
  return useQuery({
    queryKey: ['comex-kpis'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'comex_kpis_pr')
        .single()
      return data?.data as {
        exportacoes_usd: number
        importacoes_usd: number
        saldo_usd: number
        variacao_export_yoy: number
        mes_referencia: string
      } | null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useEmpregoAgro() {
  return useQuery({
    queryKey: ['emprego-agro'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'emprego_agro_pr')
        .single()
      return data?.data as {
        estoque_atual: number
        saldo_mes: number
        variacao_yoy: number
        serie: Array<{ ano_mes: string; saldo: number; estoque: number }>
      } | null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}

export function useCreditoRural() {
  return useQuery({
    queryKey: ['credito-rural'],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_cache')
        .select('data')
        .eq('cache_key', 'credito_rural_pr')
        .single()
      return data?.data as {
        total_ano_brl: number
        num_contratos: number
        variacao_yoy: number
        serie: Array<{ ano_mes: string; valor: number }>
      } | null
    },
    staleTime: 1000 * 60 * 60 * 6,
  })
}
```

## PASSO 3: Criar src/components/agro/Sparkline.tsx

```typescript
// src/components/agro/Sparkline.tsx
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklineProps {
  data: Array<{ value: number; label?: string }>
  color?: string
  height?: number
}

export function Sparkline({ data, color = '#10b981', height = 40 }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-text-muted text-2xs">sem dados</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 4, padding: '4px 8px' }}
          itemStyle={{ color: '#f9fafb', fontSize: 11 }}
          labelStyle={{ display: 'none' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

## PASSO 4: Criar src/components/agro/PrecosDiariosTab.tsx

```typescript
// src/components/agro/PrecosDiariosTab.tsx
import { useState } from 'react'
import { usePrecosDiarios } from '@/hooks/useAgro'
import { PRODUTOS_DESTAQUE } from '@/types/agro'
import { formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonList } from '@/components/ui/SkeletonCard'

export function PrecosDiariosTab() {
  const [produto, setProduto] = useState<string>(PRODUTOS_DESTAQUE[0])
  const { data: precos, isLoading, isError } = usePrecosDiarios(produto)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {PRODUTOS_DESTAQUE.map(p => (
          <button
            key={p}
            onClick={() => setProduto(p)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              produto === p
                ? 'bg-accent-green/20 border-accent-green text-accent-green'
                : 'border-border text-text-secondary hover:border-accent-green/50'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {isLoading && <SkeletonList rows={8} />}
      {isError && (
        <div className="card p-4 border-l-2 border-status-warning">
          <p className="text-status-warning text-sm">API de preços indisponível. Tente novamente mais tarde.</p>
          <p className="text-text-muted text-xs mt-1">Backend Flask: VITE_PRECOS_API_URL</p>
        </div>
      )}

      {precos && Array.isArray(precos) && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-text-muted text-xs font-medium">Produto</th>
                <th className="text-left py-2 px-3 text-text-muted text-xs font-medium">Mercado</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Mín</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Máx</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Médio</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Unid.</th>
                <th className="text-right py-2 px-3 text-text-muted text-xs font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {precos.slice(0, 30).map((p: any, i: number) => (
                <tr key={i} className="border-b border-border/50 hover:bg-background-elevated transition-colors">
                  <td className="py-2 px-3 text-text-primary font-medium text-xs">{p.produto || p.Produto}</td>
                  <td className="py-2 px-3 text-text-secondary text-xs">{p.mercado || p.Mercado || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs text-text-secondary">{p.preco_min ? formatCurrency(p.preco_min, 'BRL').replace('R$\xa0', '') : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs text-text-secondary">{p.preco_max ? formatCurrency(p.preco_max, 'BRL').replace('R$\xa0', '') : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-text-primary">{p.preco_medio ? formatCurrency(p.preco_medio, 'BRL') : '—'}</td>
                  <td className="py-2 px-3 text-right text-2xs text-text-muted">{p.unidade || p.Unidade || '—'}</td>
                  <td className="py-2 px-3 text-right text-2xs text-text-muted">{formatDate(p.data || p.Data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

## PASSO 5: Criar src/components/agro/SerieChart.tsx

```typescript
// src/components/agro/SerieChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SerieChartProps {
  data: Array<{ ano_mes: string; value: number }>
  label: string
  color?: string
  formatValue?: (v: number) => string
}

export function SerieChart({ data, label, color = '#10b981', formatValue }: SerieChartProps) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data.slice(-24)} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="ano_mes" tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false} interval={3} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false}
            tickFormatter={v => formatValue ? formatValue(v) : String(v)} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            itemStyle={{ color: '#f9fafb', fontSize: 12 }}
            formatter={(v: number) => [formatValue ? formatValue(v) : v, label]}
          />
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

## PASSO 6: Criar src/pages/AgroPage.tsx (completo)

```typescript
// src/pages/AgroPage.tsx
import { useState } from 'react'
import { useVbpKpis, useComexKpis, useEmpregoAgro, useCreditoRural } from '@/hooks/useAgro'
import { PrecosDiariosTab } from '@/components/agro/PrecosDiariosTab'
import { SerieChart } from '@/components/agro/SerieChart'
import { Sparkline } from '@/components/agro/Sparkline'
import { KpiCard } from '@/components/ui/KpiCard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatNumber } from '@/lib/utils'

type Tab = 'precos' | 'vbp' | 'comex' | 'emprego' | 'credito'

export function AgroPage() {
  const [activeTab, setActiveTab] = useState<Tab>('precos')
  const [showPaywall, setShowPaywall] = useState(false)
  const { isPro } = useAuth()

  const { data: vbp, isLoading: loadingVbp } = useVbpKpis()
  const { data: comex, isLoading: loadingComex } = useComexKpis()
  const { data: emprego } = useEmpregoAgro()
  const { data: credito } = useCreditoRural()

  if (!isPro) {
    return (
      <div className="p-6">
        <PaywallModal feature="Agronegócio" requiredPlan="pro" onClose={() => history.back()} />
      </div>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'precos', label: 'Preços Diários' },
    { id: 'vbp', label: 'VBP' },
    { id: 'comex', label: 'ComexStat' },
    { id: 'emprego', label: 'Emprego' },
    { id: 'credito', label: 'Crédito Rural' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Agronegócio</h1>
        <p className="text-text-secondary text-sm mt-1">VBP · Preços · Exportações · Emprego · Crédito Rural</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ErrorBoundary>
          <KpiCard
            label="VBP Total PR"
            value={vbp ? formatCurrency(vbp.vbp_total_brl / 1e9, 'BRL').replace(',00', '') + ' bi' : '—'}
            subvalue={`Ref. ${vbp?.ano_referencia || '—'}`}
            trend={vbp?.variacao_yoy}
            accentColor="green"
            loading={loadingVbp}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Exportações"
            value={comex ? `US$ ${(comex.exportacoes_usd / 1e9).toFixed(1)} bi` : '—'}
            subvalue={comex?.mes_referencia}
            trend={comex?.variacao_export_yoy}
            accentColor="blue"
            loading={loadingComex}
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Emprego Agro"
            value={emprego ? formatNumber(emprego.estoque_atual) : '—'}
            subvalue={emprego ? `Saldo: ${emprego.saldo_mes >= 0 ? '+' : ''}${formatNumber(emprego.saldo_mes)}` : undefined}
            trend={emprego?.variacao_yoy}
            accentColor="green"
          />
        </ErrorBoundary>
        <ErrorBoundary>
          <KpiCard
            label="Crédito Rural"
            value={credito ? `R$ ${(credito.total_ano_brl / 1e9).toFixed(1)} bi` : '—'}
            trend={credito?.variacao_yoy}
            accentColor="blue"
          />
        </ErrorBoundary>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-accent-green text-accent-green'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        <ErrorBoundary moduleName={activeTab}>
          {activeTab === 'precos' && <PrecosDiariosTab />}
          {activeTab === 'vbp' && vbp && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <KpiCard label="Lavoura" value={`R$ ${(vbp.vbp_lavoura_brl / 1e9).toFixed(1)} bi`} accentColor="green" />
              <KpiCard label="Pecuária" value={`R$ ${(vbp.vbp_pecuaria_brl / 1e9).toFixed(1)} bi`} accentColor="blue" />
            </div>
          )}
          {activeTab === 'emprego' && emprego?.serie && (
            <SerieChart
              data={emprego.serie.map(d => ({ ano_mes: d.ano_mes, value: d.saldo }))}
              label="Saldo de Empregos Agropecuários (CAGED)"
              color="#10b981"
              formatValue={v => (v >= 0 ? '+' : '') + formatNumber(v)}
            />
          )}
          {activeTab === 'credito' && credito?.serie && (
            <SerieChart
              data={credito.serie.map(d => ({ ano_mes: d.ano_mes, value: d.valor / 1e6 }))}
              label="Crédito Rural Paraná (R$ milhões)"
              color="#8b5cf6"
              formatValue={v => `${formatNumber(v, 0)}mi`}
            />
          )}
          {activeTab === 'comex' && (
            <div className="card p-6 text-center text-text-secondary">
              <p>Dados ComexStat — utilize o módulo Datageo ComexStat existente ou aguarde integração.</p>
              <a
                href="https://avnergomes.github.io/comexstat-parana"
                target="_blank"
                rel="noopener"
                className="text-accent-blue hover:underline text-sm mt-2 inline-block"
              >
                Abrir Datageo ComexStat →
              </a>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}
```

## PASSO 7: Popular data_cache via script inicial

Para testar sem o cron rodando, execute este snippet no Supabase SQL Editor:

```sql
-- Inserir KPIs de VBP mockados para desenvolvimento
INSERT INTO public.data_cache (cache_key, source, data)
VALUES (
  'vbp_kpis_pr',
  'vbp-parana',
  '{
    "vbp_total_brl": 87500000000,
    "vbp_lavoura_brl": 62000000000,
    "vbp_pecuaria_brl": 25500000000,
    "variacao_yoy": 8.3,
    "ano_referencia": 2023
  }'::jsonb
)
ON CONFLICT (cache_key) DO NOTHING;

INSERT INTO public.data_cache (cache_key, source, data)
VALUES (
  'comex_kpis_pr',
  'comexstat',
  '{
    "exportacoes_usd": 16800000000,
    "importacoes_usd": 5200000000,
    "saldo_usd": 11600000000,
    "variacao_export_yoy": 12.5,
    "mes_referencia": "2024-11"
  }'::jsonb
)
ON CONFLICT (cache_key) DO NOTHING;
```
```

---

## Arquivos Criados/Modificados

```
src/
├── types/agro.ts                         (CRIADO)
├── hooks/useAgro.ts                      (CRIADO)
├── components/agro/
│   ├── Sparkline.tsx                     (CRIADO)
│   ├── PrecosDiariosTab.tsx              (CRIADO)
│   └── SerieChart.tsx                    (CRIADO)
└── pages/AgroPage.tsx                    (SUBSTITUÍDO)
```

---

## Verificação

1. Navegar para `/agronegocio` (com plano Pro/trial) → ver KPI cards
2. Tab "Preços Diários" → tabela de preços da API Flask
3. Tab "Emprego" → gráfico de barras com saldo CAGED
4. Sem plano Pro → `PaywallModal` aparece imediatamente
5. API Flask offline → card de erro amigável aparece na aba Preços

---

## Notas Técnicas

- **Reutilização do Datageo**: Os JSONs processados do Datageo devem ser carregados via ETL para o `data_cache` do Supabase. O ETL (prompt 11) lê os repos existentes (`vbp-parana`, `comexstat-parana`) e popula o cache.
- **API Flask de preços**: A URL está em `VITE_PRECOS_API_URL`. Se a API tiver CORS habilitado para `avnergomes.github.io`, o fetch funciona direto do browser. Caso contrário, criar uma Edge Function proxy.
- **Tab ComexStat**: Por simplicidade do MVP, linka para o Datageo existente. Para integração completa, o ETL deve processar os dados e armazená-los no `data_cache`.
