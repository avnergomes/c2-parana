# PROMPT 05 — [MÉDIO] Correções Diversas

## Contexto
5 bugs de prioridade média que afetam robustez e UX mas não bloqueiam o funcionamento.

---

## Bug #7: air_quality usa insert ao invés de upsert

### Arquivo: `scripts/etl_ambiente.py`, linha 143

**Problema**: `air_quality` usa `insert` (não upsert). Com cron a cada 6h e limpeza após 7 dias, haverá 28 registros por cidade acumulados, gerando duplicatas.

**De** (linha 143):
```python
supabase.table("air_quality").insert(aq_records).execute()
```

**Para**:
```python
supabase.table("air_quality").upsert(
    aq_records,
    on_conflict="city"
).execute()
```

**Pré-requisito**: adicionar UNIQUE constraint na coluna `city` da tabela `air_quality`. Criar migration:

### Arquivo: Criar `supabase/migrations/005_air_quality_unique.sql`

```sql
-- Migration 005: UNIQUE constraint em air_quality por cidade
-- Manter apenas a leitura mais recente por cidade

-- Remover duplicatas (manter a mais recente por cidade)
DELETE FROM public.air_quality a
USING public.air_quality b
WHERE a.id < b.id
  AND a.city = b.city;

-- Criar constraint
ALTER TABLE public.air_quality ADD CONSTRAINT uq_air_quality_city UNIQUE (city);
```

**Nota**: após essa mudança, cada upsert sobrescreve o registro anterior da cidade. O campo `observed_at` já registra quando foi medido. Se quiser manter histórico, usar `on_conflict="city,observed_at"` e adicionar UNIQUE em `(city, DATE(observed_at))` — mas para o MVP, manter apenas o valor mais recente por cidade é suficiente.

---

## Bug #8: isPro é true para qualquer trial

### Arquivo: `src/contexts/AuthContext.tsx`, linha 104

**Problema**: `isPro` é `true` para qualquer usuário em trial independente do plano:
```typescript
const isPro = hasAccess && (subscription?.plan === 'pro' || subscription?.plan === 'enterprise' || accessStatus === 'trialing')
```

Na prática, o trigger SQL cria trial com `plan = 'pro'` (linha 71 da migration 001), então todos os trials são Pro. Mas se um dia for criado um trial Solo, esse código concederia acesso Pro incorretamente.

**Correção**: tornar o cálculo explícito sobre o plano do trial:
```typescript
const isPro = hasAccess && (subscription?.plan === 'pro' || subscription?.plan === 'enterprise')
```

Como o trigger SQL já cria o trial com `plan = 'pro'`, o trial continuará tendo acesso Pro. Mas agora, se alguém criar manualmente um trial com `plan = 'solo'`, não terá acesso Pro indevido.

**Alternativa (se quiser manter trial = Pro explicitamente)**:
Adicionar comentário explicando a decisão:
```typescript
// Trial sempre dá acesso Pro (o trigger SQL cria com plan='pro')
// Se mudar isso, atualizar também handle_new_subscription() no SQL
const isPro = hasAccess && (subscription?.plan === 'pro' || subscription?.plan === 'enterprise')
```

---

## Bug #9: Sem refresh de subscription após checkout

### Arquivo: `src/pages/CheckoutSuccess.tsx`

Estado atual:
```tsx
useEffect(() => {
  refreshSubscription()
  const timer = setTimeout(() => navigate('/dashboard'), 4000)
  return () => clearTimeout(timer)
}, [])
```

**Problema**: `refreshSubscription()` é chamado uma vez, mas o webhook do Stripe pode demorar alguns segundos para processar e atualizar o banco. Se o refresh acontece antes do webhook, o usuário chega ao dashboard ainda com status antigo.

**Correção**: adicionar retry com polling:
```tsx
useEffect(() => {
  let attempts = 0
  const maxAttempts = 5
  
  const pollSubscription = async () => {
    await refreshSubscription()
    attempts++
    
    // Verificar se a subscription foi atualizada para 'active'
    // Se ainda está 'trialing' ou sem subscription, tentar novamente
    if (attempts < maxAttempts) {
      setTimeout(pollSubscription, 2000) // Retry a cada 2s
    }
  }
  
  pollSubscription()
  
  // Redirecionar após 6s (dá tempo para 3 tentativas de polling)
  const timer = setTimeout(() => navigate('/dashboard'), 6000)
  return () => clearTimeout(timer)
}, [])
```

**Alternativa mais simples**: apenas aumentar o delay e fazer 2 refreshes:
```tsx
useEffect(() => {
  // Primeiro refresh imediato
  refreshSubscription()
  
  // Segundo refresh após 3s (dá tempo pro webhook do Stripe)
  const retryTimer = setTimeout(() => refreshSubscription(), 3000)
  
  // Redirecionar após 5s
  const navTimer = setTimeout(() => navigate('/dashboard'), 5000)
  
  return () => {
    clearTimeout(retryTimer)
    clearTimeout(navTimer)
  }
}, [])
```

---

## Bug #10: useDengueSerie com limit potencialmente insuficiente

### Arquivo: `src/hooks/useSaude.ts`, linha 66

**Problema**: `limit(semanas * (ibgeCode ? 1 : 399))` = `limit(4788)` sem filtro de município. O Supabase free tier tem default max rows de 1.000.

**Correção**: Quando não há filtro por município, agregar no frontend é inviável. Melhor usar RPC ou limitar a consulta.

**Opção mais simples** — limitar para os municípios com mais casos:
```typescript
export function useDengueSerie(ibgeCode?: string, semanas = 12) {
  return useQuery({
    queryKey: ['dengue-serie', ibgeCode, semanas],
    queryFn: async () => {
      let query = supabase
        .from('dengue_data')
        .select('ibge_code, municipality_name, epidemiological_week, year, cases, alert_level')
        .order('year', { ascending: true })
        .order('epidemiological_week', { ascending: true })

      if (ibgeCode) {
        query = query.eq('ibge_code', ibgeCode).limit(semanas)
      } else {
        // Sem filtro: buscar apenas últimas 2 semanas (mais gerenciável)
        // e limitar a 1000 rows para respeitar o default do Supabase
        query = query.limit(1000)
      }

      const { data } = await query
      return data || []
    },
    staleTime: 1000 * 60 * 60,
  })
}
```

**Opção melhor (RPC)**: Criar uma função SQL que agrega dados de dengue por semana:

### Arquivo: Adicionar ao `supabase/migrations/` ou usar SQL direto:
```sql
CREATE OR REPLACE FUNCTION public.dengue_serie_resumo(p_semanas INTEGER DEFAULT 12)
RETURNS TABLE(
  epidemiological_week INTEGER,
  year INTEGER,
  total_cases BIGINT,
  municipios_alerta BIGINT,
  municipios_epidemia BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.epidemiological_week,
    d.year,
    SUM(d.cases)::BIGINT as total_cases,
    COUNT(*) FILTER (WHERE d.alert_level >= 1)::BIGINT as municipios_alerta,
    COUNT(*) FILTER (WHERE d.alert_level >= 3)::BIGINT as municipios_epidemia
  FROM public.dengue_data d
  WHERE (d.year, d.epidemiological_week) IN (
    SELECT DISTINCT dd.year, dd.epidemiological_week
    FROM public.dengue_data dd
    ORDER BY dd.year DESC, dd.epidemiological_week DESC
    LIMIT p_semanas
  )
  GROUP BY d.epidemiological_week, d.year
  ORDER BY d.year ASC, d.epidemiological_week ASC;
END;
$$ LANGUAGE plpgsql STABLE;
```

Se optar pela RPC, o hook ficaria:
```typescript
const { data } = await supabase.rpc('dengue_serie_resumo', { p_semanas: semanas })
```

**Escolher a opção mais simples** (limitar para 1000 rows com `limit(1000)`) para o MVP. A RPC pode ser adicionada depois.

---

## Bug #11: window.municipiosGeoJSON como global

### Arquivo: `src/components/map/MapContainer.tsx`, linha 42

**Problema**: `window.municipiosGeoJSON = data` — variável global sem tipagem TypeScript.

**Correção**: Remover a variável global. Analisar se ela é usada em outros arquivos (layers). Se as layers precisam do GeoJSON, passar via props ou usar React Context.

**Passo 1**: Verificar se `window.municipiosGeoJSON` é referenciado em outros arquivos:
```bash
grep -r "municipiosGeoJSON" src/
```

Se for usado em `DengueLayer.tsx` ou outro layer, criar um contexto:

### Arquivo: Criar `src/contexts/MapDataContext.tsx`
```tsx
import React, { createContext, useContext } from 'react'
import type { GeoJsonObject } from 'geojson'

interface MapDataContextType {
  municipiosGeoJSON: GeoJsonObject | null
}

const MapDataContext = createContext<MapDataContextType>({ municipiosGeoJSON: null })

export function MapDataProvider({ geoJSON, children }: { geoJSON: GeoJsonObject | null; children: React.ReactNode }) {
  return (
    <MapDataContext.Provider value={{ municipiosGeoJSON: geoJSON }}>
      {children}
    </MapDataContext.Provider>
  )
}

export function useMapData() {
  return useContext(MapDataContext)
}
```

### Arquivo: Atualizar `src/components/map/MapContainer.tsx`
- Remover `window.municipiosGeoJSON = data` (linha 42)
- Wrappear o conteúdo com `<MapDataProvider geoJSON={geoJSON}>`
- Nas layers que precisam, usar `const { municipiosGeoJSON } = useMapData()`

**Se `window.municipiosGeoJSON` não for usado em nenhum outro arquivo**, simplesmente remover a linha 42.

---

## Critério de Sucesso
- [ ] `air_quality` usa upsert com `on_conflict="city"` + migration com UNIQUE
- [ ] `isPro` não depende de `accessStatus === 'trialing'` — depende apenas de `subscription.plan`
- [ ] CheckoutSuccess faz polling de refresh (pelo menos 2 tentativas com delay)
- [ ] `useDengueSerie` não faz query > 1000 rows sem filtro de município
- [ ] `window.municipiosGeoJSON` removido — substituído por contexto ou removido se não usado
