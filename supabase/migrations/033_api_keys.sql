-- supabase/migrations/033_api_keys.sql
-- DataGeo PR: superfície de API pública (chaves + uso + quota por plano).
--
-- Decisão de design:
--   - Armazenamos APENAS o hash SHA-256 da chave; o prefixo "dgp_live_XXXX"
--     é exibido só na criação. Roubo do banco não vaza chaves utilizáveis.
--   - api_usage é apenas append-only; particionável depois (uso por mês).
--   - Quota é checada em tempo de chamada via função check_api_quota().

-- ============================================================
-- TABELA: api_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,                       -- rótulo do usuário ("prod", "dev iphone")
  key_prefix TEXT NOT NULL,                 -- primeiros 12 chars para identificar visualmente
  key_hash TEXT NOT NULL UNIQUE,            -- SHA-256 hex da chave inteira
  scopes TEXT[] DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                   -- NULL = nunca expira
  revoked_at TIMESTAMPTZ,                   -- NULL = ativa
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Usuário só vê e gerencia as próprias chaves; o service role da edge function
-- usa SECURITY DEFINER em check_api_quota para olhar todas.
DROP POLICY IF EXISTS api_keys_owner ON public.api_keys;
CREATE POLICY api_keys_owner ON public.api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABELA: api_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_usage (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_ms INTEGER,
  ip INET,
  user_agent TEXT,
  called_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_time ON public.api_usage(api_key_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_time ON public.api_usage(user_id, called_at DESC);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_usage_owner_read ON public.api_usage;
CREATE POLICY api_usage_owner_read ON public.api_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- QUOTA POR PLANO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_quotas (
  plan TEXT PRIMARY KEY,
  monthly_calls INTEGER NOT NULL,
  max_keys INTEGER NOT NULL,
  allow_webhooks BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO public.plan_quotas (plan, monthly_calls, max_keys, allow_webhooks) VALUES
  ('free',       1000,    1, FALSE),
  ('trialing',   10000,   1, FALSE),  -- trial usa quota do starter
  ('solo',       10000,   1, FALSE),  -- legado = starter
  ('starter',    10000,   1, FALSE),
  ('pro',        100000,  5, TRUE),
  ('enterprise', 10000000, 50, TRUE)
ON CONFLICT (plan) DO UPDATE SET
  monthly_calls = EXCLUDED.monthly_calls,
  max_keys      = EXCLUDED.max_keys,
  allow_webhooks = EXCLUDED.allow_webhooks;

-- ============================================================
-- FUNÇÃO: check_api_quota(key_hash)
-- Retorna a chave + plano + quota restante no mês corrente.
-- Usada pela edge function public-api a cada request.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_api_quota(p_key_hash TEXT)
RETURNS TABLE (
  api_key_id UUID,
  user_id UUID,
  plan TEXT,
  status TEXT,
  monthly_limit INTEGER,
  used_this_month INTEGER,
  remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key public.api_keys%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan TEXT;
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  SELECT * INTO v_key
  FROM public.api_keys
  WHERE key_hash = p_key_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE user_id = v_key.user_id;

  -- Sem subscription = free tier (registrou mas não ativou).
  v_plan := COALESCE(v_sub.plan, 'free');

  -- Se trialing/active, usa o plano. Se expirado/canceled, cai para 'free'.
  IF v_sub.status NOT IN ('trialing', 'active') THEN
    v_plan := 'free';
  END IF;

  SELECT monthly_calls INTO v_limit
  FROM public.plan_quotas WHERE plan = v_plan;

  IF v_limit IS NULL THEN
    v_limit := 1000;  -- default seguro = free
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used
  FROM public.api_usage
  WHERE api_key_id = v_key.id
    AND called_at >= date_trunc('month', NOW());

  api_key_id := v_key.id;
  user_id := v_key.user_id;
  plan := v_plan;
  status := COALESCE(v_sub.status, 'none');
  monthly_limit := v_limit;
  used_this_month := v_used;
  remaining := GREATEST(0, v_limit - v_used);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_api_quota(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_api_quota(TEXT) TO service_role;
