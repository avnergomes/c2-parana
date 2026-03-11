-- Migration 008: Permitir leitura anon em tabelas de dados públicos
-- Necessário enquanto auth está desabilitado para testes

-- Dropar policies antigas (authenticated-only)
DROP POLICY IF EXISTS "data_cache: select authenticated" ON public.data_cache;
DROP POLICY IF EXISTS "Data cache por plano" ON public.data_cache;
DROP POLICY IF EXISTS "alerts: select authenticated" ON public.alerts;
DROP POLICY IF EXISTS "climate_data: select authenticated" ON public.climate_data;
DROP POLICY IF EXISTS "news_items: select authenticated" ON public.news_items;
DROP POLICY IF EXISTS "dengue_data: select authenticated" ON public.dengue_data;
DROP POLICY IF EXISTS "fire_spots: select authenticated" ON public.fire_spots;
DROP POLICY IF EXISTS "river_levels: select authenticated" ON public.river_levels;
DROP POLICY IF EXISTS "air_quality: select authenticated" ON public.air_quality;
DROP POLICY IF EXISTS "legislative_items: select authenticated" ON public.legislative_items;

-- Recriar policies permitindo anon + authenticated
CREATE POLICY "data_cache: select public"
  ON public.data_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "alerts: select public"
  ON public.alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "climate_data: select public"
  ON public.climate_data FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "news_items: select public"
  ON public.news_items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "dengue_data: select public"
  ON public.dengue_data FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "fire_spots: select public"
  ON public.fire_spots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "river_levels: select public"
  ON public.river_levels FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "air_quality: select public"
  ON public.air_quality FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "legislative_items: select public"
  ON public.legislative_items FOR SELECT
  TO anon, authenticated
  USING (true);
