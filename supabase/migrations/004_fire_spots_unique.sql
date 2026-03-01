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
