-- supabase/migrations/003_functions.sql

-- Função para verificar se o usuário tem assinatura ativa
-- Retorna: 'trialing' | 'active' | 'expired' | 'none'
CREATE OR REPLACE FUNCTION public.get_user_access_status(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  sub RECORD;
BEGIN
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

-- View útil: subscription completa com status calculado
CREATE OR REPLACE VIEW public.user_access AS
SELECT
  s.*,
  public.get_user_access_status(s.user_id) AS access_status,
  CASE
    WHEN public.get_user_access_status(s.user_id) IN ('trialing', 'active') THEN TRUE
    ELSE FALSE
  END AS has_access
FROM public.subscriptions s;

-- Permissão: usuário só vê a própria linha
ALTER VIEW public.user_access OWNER TO postgres;
GRANT SELECT ON public.user_access TO authenticated;

-- RLS na view (Supabase usa security invoker por padrão em views)
-- Alternativa: usar função RPC que filtra por auth.uid()
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS TABLE(
  status TEXT,
  plan TEXT,
  trial_end TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  access_status TEXT,
  has_access BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.status,
    s.plan,
    s.trial_end,
    s.current_period_end,
    public.get_user_access_status(s.user_id),
    CASE WHEN public.get_user_access_status(s.user_id) IN ('trialing', 'active') THEN TRUE ELSE FALSE END
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
