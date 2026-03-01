# PROMPT 04 — [ALTO] Paywall Legislativo + UNIQUE fire_spots + Dashboard Real

## Contexto
Três bugs de prioridade alta que podem ser corrigidos em um único prompt:

1. **Bug #4**: LegislativoPage sem paywall — `/legislativo` está marcado como Pro no Sidebar mas o componente não aplica paywall
2. **Bug #5**: `fire_spots` sem UNIQUE constraint — ETL insere duplicatas do FIRMS
3. **Bug #6**: Dashboard com valores hardcoded — não mostra dados reais

---

## Tarefa 1: Paywall no LegislativoPage

### Arquivo: `src/pages/LegislativoPage.tsx`

Estado atual (21 linhas, sem paywall):
```tsx
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function LegislativoPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Legislativo</h1>
        <p className="text-text-secondary text-sm mt-1">
          Assembleia Legislativa do Paraná — projetos de lei, sessões e votações
        </p>
      </div>
      <ErrorBoundary moduleName="legislativo">
        <AlepFeed />
      </ErrorBoundary>
    </div>
  )
}
```

Corrigir para incluir paywall Pro, seguindo o padrão de `SaudePage.tsx` e `AmbientePage.tsx`:

```tsx
import { AlepFeed } from '@/components/noticias/AlepFeed'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PaywallModal } from '@/components/ui/PaywallModal'
import { useAuth } from '@/contexts/AuthContext'

export function LegislativoPage() {
  const { isPro } = useAuth()

  if (!isPro) {
    return <div className="p-6"><PaywallModal feature="Legislativo" requiredPlan="pro" onClose={() => history.back()} /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Legislativo</h1>
        <p className="text-text-secondary text-sm mt-1">
          Assembleia Legislativa do Paraná — projetos de lei, sessões e votações
        </p>
      </div>
      <ErrorBoundary moduleName="legislativo">
        <AlepFeed />
      </ErrorBoundary>
    </div>
  )
}
```

**Alternativa (melhor)**: usar `requirePro` no roteador, que é mais limpo e centralizado.

No `src/router/index.tsx`, alterar a rota `/legislativo` de:
```tsx
<Route path="/legislativo" element={<LegislativoPage />} />
```
Para:
```tsx
<Route path="/legislativo" element={<ProtectedRoute requirePro><LegislativoPage /></ProtectedRoute>} />
```

Mas como as rotas protegidas estão agrupadas sob um `<ProtectedRoute>` wrapper sem `requirePro`, o mais simples é adicionar o paywall diretamente no componente, como feito em `AgroPage`, `SaudePage` e `AmbientePage`.

**Implementar a solução PaywallModal dentro do componente** (consistente com os outros módulos Pro).

---

## Tarefa 2: UNIQUE Constraint em fire_spots

### Arquivo: Criar `supabase/migrations/004_fire_spots_unique.sql`

O FIRMS retorna focos dos últimos N dias. Se o cron roda a cada 6h, o mesmo foco (mesmo lat/lon/data/hora) será inserido até 4 vezes antes de ser "antigo demais" para aparecer.

```sql
-- Migration 004: Adicionar UNIQUE constraint em fire_spots para evitar duplicatas do FIRMS
-- Um foco é único pela combinação latitude + longitude + data + hora de aquisição

-- Primeiro, remover duplicatas existentes (manter o registro mais antigo)
DELETE FROM public.fire_spots a
USING public.fire_spots b
WHERE a.id > b.id
  AND a.latitude = b.latitude
  AND a.longitude = b.longitude
  AND a.acq_date = b.acq_date
  AND COALESCE(a.acq_time, '') = COALESCE(b.acq_time, '');

-- Criar constraint UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_fire_spots_unique 
ON public.fire_spots(latitude, longitude, acq_date, COALESCE(acq_time, ''));
```

### Atualizar `scripts/etl_ambiente.py`

Na função `main()`, linha 134, alterar o upsert de `fire_spots` para usar o novo conflict key:

**De**:
```python
supabase.table("fire_spots").upsert(spots).execute()
```

**Para**:
```python
# Inserir apenas focos novos (ignorar duplicatas via ON CONFLICT)
for spot in spots:
    try:
        supabase.table("fire_spots").upsert(
            spot,
            on_conflict="latitude,longitude,acq_date"
        ).execute()
    except:
        pass  # Duplicata ou erro individual — seguir
```

Ou, mais eficiente, fazer batch upsert se o Supabase client suportar:
```python
supabase.table("fire_spots").upsert(
    spots,
    on_conflict="latitude,longitude,acq_date"
).execute()
```

Nota: o `on_conflict` do supabase-py precisa referenciar colunas com UNIQUE constraint. A nova migration cria essa constraint, então o upsert funcionará.

---

## Tarefa 3: Dashboard com Dados Reais

### Arquivo: `src/pages/Dashboard.tsx`

Estado atual (27 linhas, valores hardcoded "7", "399", ">200"):

Substituir por um Dashboard que agrega KPIs reais de todos os módulos:

```tsx
// src/pages/Dashboard.tsx
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/ui/KpiCard'
import { useEstacoesPR, useAlertasINMET } from '@/hooks/useClima'
import { useNoticiasStats } from '@/hooks/useNoticias'
import { useFireSpots } from '@/hooks/useAmbiente'
import { useDengueAtual } from '@/hooks/useSaude'

export function DashboardPage() {
  const { user, subscription, accessStatus, isPro } = useAuth()
  
  // Dados reais dos módulos
  const { data: estacoes, isLoading: loadingClima } = useEstacoesPR()
  const { data: alertas, isLoading: loadingAlertas } = useAlertasINMET()
  const { data: noticiasStats, isLoading: loadingNoticias } = useNoticiasStats()
  const { data: fires, isLoading: loadingFires } = useFireSpots(1) // últimas 24h
  const { data: dengueAtual, isLoading: loadingDengue } = useDengueAtual()

  const alertasAtivos = (alertas || []).filter(a => a.is_active).length
  const noticiasUrgentes = noticiasStats?.urgentes || 0
  const focosHoje = fires?.length || 0
  const municipiosDengueAlerta = dengueAtual?.filter(d => (d.alert_level || 0) >= 1).length || 0

  // Temperatura atual de Curitiba (estação A807)
  const curitiba = estacoes?.find(e => e.station_code === 'A807')
  const tempCuritiba = curitiba?.temperature ? `${curitiba.temperature.toFixed(1)}°C` : '—'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">
          Bem-vindo ao C2 Paraná, {user?.email}
        </p>
      </div>

      {/* Status da conta */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          label="Plano" 
          value={accessStatus === 'trialing' ? 'Trial' : subscription?.plan?.toUpperCase() || '—'} 
          accentColor="blue" 
        />
        <KpiCard 
          label="Curitiba agora" 
          value={tempCuritiba} 
          accentColor="blue" 
          loading={loadingClima} 
        />
        <KpiCard 
          label="Alertas INMET" 
          value={alertasAtivos} 
          accentColor={alertasAtivos > 0 ? 'red' : 'green'} 
          loading={loadingAlertas} 
        />
        <KpiCard 
          label="Notícias urgentes (24h)" 
          value={noticiasUrgentes} 
          accentColor={noticiasUrgentes > 0 ? 'red' : 'green'} 
          loading={loadingNoticias} 
        />
      </div>

      {/* KPIs Pro (se tiver acesso) */}
      {isPro && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard 
            label="Focos de calor (24h)" 
            value={focosHoje} 
            accentColor={focosHoje > 10 ? 'red' : focosHoje > 0 ? 'yellow' : 'green'} 
            loading={loadingFires} 
          />
          <KpiCard 
            label="Municípios dengue alerta" 
            value={municipiosDengueAlerta} 
            accentColor={municipiosDengueAlerta > 10 ? 'red' : municipiosDengueAlerta > 0 ? 'yellow' : 'green'} 
            loading={loadingDengue} 
          />
          <KpiCard 
            label="Estações INMET" 
            value={estacoes?.length ?? '—'} 
            accentColor="blue" 
            loading={loadingClima} 
          />
          <KpiCard 
            label="Municípios PR" 
            value="399" 
            accentColor="blue" 
          />
        </div>
      )}

      <p className="text-text-muted text-sm">
        Use o menu lateral para navegar pelos módulos de inteligência.
      </p>
    </div>
  )
}
```

**Importante**: verificar que `useNoticiasStats()` existe em `src/hooks/useNoticias.ts` e retorna `{ total, urgentes, importantes }` — atualmente existe e calcula stats das últimas 24h. Pode ser necessário ajustar a interface retornada.

Se `useNoticiasStats` não retorna `urgentes` como campo, adaptar para usar o que retorna. Verificar o hook e mapear corretamente.

---

## Critério de Sucesso
- [ ] LegislativoPage bloqueia acesso para usuários sem plano Pro
- [ ] Migration 004 cria UNIQUE constraint em fire_spots
- [ ] ETL ambiente faz upsert com on_conflict para fire_spots
- [ ] Dashboard exibe dados reais: temperatura Curitiba, alertas INMET, notícias urgentes 24h, focos de calor
- [ ] Dashboard diferencia KPIs básicos (Solo) de KPIs avançados (Pro)
