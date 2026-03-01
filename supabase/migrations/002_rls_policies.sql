-- supabase/migrations/002_rls_policies.sql
-- Row Level Security para C2 Paraná

-- ============================================================
-- profiles: usuário só vê e edita o próprio perfil
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: select own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- subscriptions: usuário só vê a própria subscription
-- (inserção/atualização apenas por service_role via webhooks)
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: select own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- data_cache: leitura pública para usuários autenticados
-- (escrita apenas pelo service_role via crons)
-- ============================================================
ALTER TABLE public.data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_cache: select authenticated"
  ON public.data_cache FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- alerts: leitura pública para autenticados
-- ============================================================
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts: select authenticated"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- climate_data: leitura para autenticados
-- ============================================================
ALTER TABLE public.climate_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "climate_data: select authenticated"
  ON public.climate_data FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- news_items: leitura para autenticados
-- ============================================================
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_items: select authenticated"
  ON public.news_items FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- dengue_data, fire_spots, river_levels, air_quality,
-- legislative_items: leitura para autenticados
-- ============================================================
ALTER TABLE public.dengue_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dengue_data: select authenticated"
  ON public.dengue_data FOR SELECT TO authenticated USING (true);

ALTER TABLE public.fire_spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fire_spots: select authenticated"
  ON public.fire_spots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.river_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "river_levels: select authenticated"
  ON public.river_levels FOR SELECT TO authenticated USING (true);

ALTER TABLE public.air_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "air_quality: select authenticated"
  ON public.air_quality FOR SELECT TO authenticated USING (true);

ALTER TABLE public.legislative_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legislative_items: select authenticated"
  ON public.legislative_items FOR SELECT TO authenticated USING (true);
