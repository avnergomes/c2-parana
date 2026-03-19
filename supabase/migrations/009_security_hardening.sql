-- Migration 009: Security hardening
-- Fixes: exposed pgcrypto/http functions, anon RLS bypass, get_user_access_status enumeration

-- ============================================================
-- 1. CRITICO: Revogar acesso a funcoes pgcrypto e http do anon/authenticated
--    Essas extensoes expoe encrypt(), decrypt(), http_get(), http_post() etc.
--    no schema public, permitindo SSRF e abusos criptograficos via API REST.
-- ============================================================

-- Revogar TODAS as funcoes do public para anon e authenticated
-- (depois re-concedemos apenas as necessarias)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Re-conceder apenas funcoes da aplicacao
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_access_status(UUID) TO authenticated;

-- ============================================================
-- 2. ALTO: Reverter migracao 008 — restaurar RLS authenticated-only
--    A migracao 008 abriu TODAS as tabelas para anon com USING(true),
--    anulando a protecao por plano da migracao 006.
-- ============================================================

-- Dropar policies abertas da migracao 008
DROP POLICY IF EXISTS "data_cache: select public" ON public.data_cache;
DROP POLICY IF EXISTS "alerts: select public" ON public.alerts;
DROP POLICY IF EXISTS "climate_data: select public" ON public.climate_data;
DROP POLICY IF EXISTS "news_items: select public" ON public.news_items;
DROP POLICY IF EXISTS "dengue_data: select public" ON public.dengue_data;
DROP POLICY IF EXISTS "fire_spots: select public" ON public.fire_spots;
DROP POLICY IF EXISTS "river_levels: select public" ON public.river_levels;
DROP POLICY IF EXISTS "air_quality: select public" ON public.air_quality;
DROP POLICY IF EXISTS "legislative_items: select public" ON public.legislative_items;

-- Restaurar policies authenticated-only (da migracao 002)
CREATE POLICY "alerts: select authenticated"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "climate_data: select authenticated"
  ON public.climate_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "news_items: select authenticated"
  ON public.news_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "dengue_data: select authenticated"
  ON public.dengue_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fire_spots: select authenticated"
  ON public.fire_spots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "river_levels: select authenticated"
  ON public.river_levels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "air_quality: select authenticated"
  ON public.air_quality FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "legislative_items: select authenticated"
  ON public.legislative_items FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 3. ALTO: Restaurar RLS por plano no data_cache (da migracao 006)
--    A migracao 008 dropou a policy "Data cache por plano" e substituiu
--    por "data_cache: select public" com USING(true).
-- ============================================================

CREATE POLICY "Data cache por plano" ON public.data_cache
  FOR SELECT
  USING (
    -- Service role sempre pode ler (para os ETLs)
    auth.role() = 'service_role'
    OR
    -- Usuarios autenticados podem ler dados solo
    (auth.role() = 'authenticated' AND min_plan = 'solo')
    OR
    -- Usuarios pro podem ler dados pro
    (auth.role() = 'authenticated' AND min_plan = 'pro' AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND (
        (status = 'active' AND plan IN ('pro', 'enterprise'))
        OR (status = 'trialing')
      )
    ))
    OR
    -- Usuarios enterprise podem ler dados enterprise
    (auth.role() = 'authenticated' AND min_plan = 'enterprise' AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
      AND plan = 'enterprise'
    ))
  );

-- ============================================================
-- 4. ALTO: Proteger get_user_access_status contra enumeracao
--    A funcao aceita qualquer UUID e roda com SECURITY DEFINER,
--    permitindo consultar status de subscription de outros usuarios.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_access_status(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  sub RECORD;
BEGIN
  -- Impedir consulta de status de outros usuarios
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot query other users';
  END IF;

  SELECT status, trial_end, current_period_end
  INTO sub
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF sub.status = 'trialing' THEN
    IF sub.trial_end > NOW() THEN
      RETURN 'trialing';
    ELSE
      RETURN 'expired';
    END IF;
  END IF;

  IF sub.status = 'active' THEN
    RETURN 'active';
  END IF;

  RETURN sub.status; -- 'past_due', 'canceled', etc.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
