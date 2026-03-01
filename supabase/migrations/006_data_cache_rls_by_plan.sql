-- Migration 006: RLS avancado para data_cache por plano
-- Diferencia dados Solo de dados Pro

-- Adicionar coluna para indicar plano minimo necessario
ALTER TABLE public.data_cache ADD COLUMN IF NOT EXISTS min_plan TEXT DEFAULT 'solo'
  CHECK (min_plan IN ('solo', 'pro', 'enterprise'));

-- Atualizar cache_keys de modulos Pro
UPDATE public.data_cache SET min_plan = 'pro' WHERE cache_key IN (
  'vbp_kpis_pr', 'vbp_municipios_pr', 'comex_kpis_pr',
  'emprego_agro_pr', 'credito_rural_pr', 'leitos_sus_pr'
);

-- Dropar a policy antiga se existir
DROP POLICY IF EXISTS "Data cache readable by authenticated" ON public.data_cache;
DROP POLICY IF EXISTS "Data cache por plano" ON public.data_cache;

-- Criar nova policy com verificacao de plano
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

-- Manter policy de insert/update para service role
DROP POLICY IF EXISTS "Data cache writable by service role" ON public.data_cache;
CREATE POLICY "Data cache writable by service role" ON public.data_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
