# PROMPT 6 — CORRIGIR CONSTRAINTS DO BANCO DE DADOS

## Prioridade: 🟡 MÉDIA — Necessário para upserts funcionarem

## Problema
Vários ETLs usam `upsert` com `on_conflict` mas as tabelas não têm as UNIQUE constraints correspondentes. Isso causa erro PostgreSQL:
```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

As migrations 004 e 005 (fire_spots e air_quality) existem nos arquivos mas podem **não ter sido aplicadas** no Supabase de produção.

## Verificação Prévia
Antes de aplicar, verificar no Supabase Dashboard → SQL Editor:

```sql
-- Verificar quais constraints existem
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid IN (
    'fire_spots'::regclass,
    'air_quality'::regclass,
    'river_levels'::regclass,
    'climate_data'::regclass,
    'dengue_data'::regclass,
    'legislative_items'::regclass,
    'data_cache'::regclass
)
ORDER BY conrelid::regclass::text, conname;
```

## SQL para Executar no Supabase Dashboard

Executar este SQL no **Supabase Dashboard → SQL Editor** (não como migration, para ter controle imediato):

```sql
-- =====================================================
-- MIGRATION: Garantir UNIQUE constraints para todos os upserts
-- Executar no Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. river_levels: UNIQUE em station_code (para upsert do ETL Ambiente)
-- Primeiro remover duplicatas se existirem
DELETE FROM public.river_levels a
USING public.river_levels b
WHERE a.id > b.id AND a.station_code = b.station_code;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_river_levels_station_code' 
        AND conrelid = 'river_levels'::regclass
    ) THEN
        ALTER TABLE public.river_levels 
        ADD CONSTRAINT uq_river_levels_station_code UNIQUE (station_code);
        RAISE NOTICE 'Criado: uq_river_levels_station_code';
    ELSE
        RAISE NOTICE 'Já existe: uq_river_levels_station_code';
    END IF;
END $$;

-- 2. fire_spots: UNIQUE em (latitude, longitude, acq_date)
-- A migration 004 usa COALESCE(acq_time, '') mas on_conflict usa apenas 3 colunas
-- Criar constraint mais simples que bate com o on_conflict do ETL
DELETE FROM public.fire_spots a
USING public.fire_spots b
WHERE a.id > b.id
  AND a.latitude = b.latitude
  AND a.longitude = b.longitude
  AND a.acq_date = b.acq_date;

-- Dropar index antigo se existir (da migration 004)
DROP INDEX IF EXISTS idx_fire_spots_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_fire_spots_location_date' 
        AND conrelid = 'fire_spots'::regclass
    ) THEN
        ALTER TABLE public.fire_spots 
        ADD CONSTRAINT uq_fire_spots_location_date UNIQUE (latitude, longitude, acq_date);
        RAISE NOTICE 'Criado: uq_fire_spots_location_date';
    ELSE
        RAISE NOTICE 'Já existe: uq_fire_spots_location_date';
    END IF;
END $$;

-- 3. air_quality: UNIQUE em city
-- A migration 005 pode já ter aplicado isso
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_air_quality_city' 
        AND conrelid = 'air_quality'::regclass
    ) THEN
        -- Remover duplicatas primeiro
        DELETE FROM public.air_quality a
        USING public.air_quality b
        WHERE a.id < b.id AND a.city = b.city;
        
        ALTER TABLE public.air_quality 
        ADD CONSTRAINT uq_air_quality_city UNIQUE (city);
        RAISE NOTICE 'Criado: uq_air_quality_city';
    ELSE
        RAISE NOTICE 'Já existe: uq_air_quality_city';
    END IF;
END $$;

-- 4. Verificar constraints que já devem existir (do initial_schema)
-- climate_data: UNIQUE em (station_code, observed_at) — idx_climate_station_time
-- dengue_data: UNIQUE em (ibge_code, year, epidemiological_week) — definido no CREATE TABLE
-- data_cache: UNIQUE em cache_key — definido no CREATE TABLE
-- legislative_items: UNIQUE em external_id — definido no CREATE TABLE
-- news_items: UNIQUE em url — definido no CREATE TABLE
-- alerts: Precisa de UNIQUE em external_id para upsert funcionar

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_alerts_external_id' 
        AND conrelid = 'alerts'::regclass
    ) THEN
        -- Remover duplicatas
        DELETE FROM public.alerts a
        USING public.alerts b
        WHERE a.id > b.id 
        AND a.external_id = b.external_id 
        AND a.external_id IS NOT NULL;
        
        -- Criar como UNIQUE INDEX (não constraint) para permitir NULLs duplicados
        CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_external_id_unique 
        ON public.alerts(external_id) WHERE external_id IS NOT NULL;
        RAISE NOTICE 'Criado: idx_alerts_external_id_unique';
    ELSE
        RAISE NOTICE 'Já existe: uq_alerts_external_id';
    END IF;
END $$;

-- 5. Verificar resultado final
SELECT 
    c.conrelid::regclass AS tabela,
    c.conname AS constraint_name,
    c.contype AS tipo,
    pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
WHERE c.conrelid IN (
    'fire_spots'::regclass,
    'air_quality'::regclass,
    'river_levels'::regclass,
    'alerts'::regclass
)
AND c.contype = 'u'
ORDER BY tabela, constraint_name;
```

## Após aplicar o SQL:
1. Rodar novamente os ETLs que estavam falhando (Ambiente e Clima)
2. Os upserts devem funcionar sem erro de constraint

## Salvar como Migration (opcional)
Se quiser manter no repo para documentação, criar arquivo `supabase/migrations/007_ensure_unique_constraints.sql` com o conteúdo acima (sem os blocos DO/IF EXISTS — usar CREATE ... IF NOT EXISTS).

## Commit (se salvar como migration)
```
git add -A && git commit -m "fix: migration 007 - garantir UNIQUE constraints para todos os upserts"
```
