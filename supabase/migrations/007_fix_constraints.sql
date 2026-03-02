-- Migration 007: Corrigir constraints para ETLs
-- 1. Adicionar UNIQUE em river_levels(station_code) para upsert funcionar
-- 2. Expandir check constraint de dengue_data.alert_level para aceitar 0-4

-- ============================================================
-- FIX 1: UNIQUE constraint em river_levels
-- ============================================================
-- Remover duplicatas (manter o mais recente)
DELETE FROM public.river_levels a
USING public.river_levels b
WHERE a.id < b.id
  AND a.station_code = b.station_code;

-- Adicionar constraint UNIQUE
ALTER TABLE public.river_levels
  ADD CONSTRAINT uq_river_levels_station UNIQUE (station_code);

-- ============================================================
-- FIX 2: Expandir alert_level em dengue_data (0-4)
-- ============================================================
-- InfoDengue pode retornar nivel 4 em casos extremos
ALTER TABLE public.dengue_data
  DROP CONSTRAINT IF EXISTS dengue_data_alert_level_check;

ALTER TABLE public.dengue_data
  ADD CONSTRAINT dengue_data_alert_level_check
  CHECK (alert_level BETWEEN 0 AND 4);
