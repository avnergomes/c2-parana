-- Migration 005: UNIQUE constraint em air_quality por cidade
-- Manter apenas a leitura mais recente por cidade

-- Remover duplicatas (manter a mais recente por cidade)
DELETE FROM public.air_quality a
USING public.air_quality b
WHERE a.id < b.id
  AND a.city = b.city;

-- Criar constraint
ALTER TABLE public.air_quality ADD CONSTRAINT uq_air_quality_city UNIQUE (city);
