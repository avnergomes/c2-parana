-- supabase/migrations/001_initial_schema.sql
-- C2 Paraná: Schema inicial

-- ============================================================
-- EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- busca de texto

-- ============================================================
-- TABELA: profiles
-- Espelha auth.users com dados adicionais do usuário
-- ============================================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Função que cria profile automaticamente ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar profile no signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TABELA: subscriptions
-- Gerencia status de assinatura e trial
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  plan TEXT NOT NULL DEFAULT 'solo'
    CHECK (plan IN ('solo', 'pro', 'enterprise')),
  trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para lookup rápido
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Criar subscription de trial automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan, trial_end)
  VALUES (NEW.id, 'trialing', 'pro', NOW() + INTERVAL '14 days');
  -- Trial dá acesso pro completo por 14 dias
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_subscription();

-- ============================================================
-- TABELA: data_cache
-- Cache de dados das APIs externas (fetched pelos crons)
-- ============================================================
CREATE TABLE public.data_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,   -- ex: 'clima_curitiba', 'dengue_pr_2025w10'
  data JSONB NOT NULL,
  source TEXT,                       -- ex: 'inmet', 'infodengue', 'firms'
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_data_cache_key ON public.data_cache(cache_key);
CREATE INDEX idx_data_cache_source ON public.data_cache(source);
CREATE INDEX idx_data_cache_fetched_at ON public.data_cache(fetched_at DESC);

-- ============================================================
-- TABELA: alerts
-- Alertas ativos (INMET, InfoDengue, FIRMS, ANA)
-- ============================================================
CREATE TABLE public.alerts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source TEXT NOT NULL,              -- 'inmet', 'infodengue', 'firms', 'ana'
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title TEXT NOT NULL,
  description TEXT,
  affected_area JSONB,               -- GeoJSON polygon/multipolygon
  affected_municipalities TEXT[],    -- array de códigos IBGE
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  external_id TEXT,                  -- ID original na fonte
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_source ON public.alerts(source);
CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_is_active ON public.alerts(is_active);
CREATE INDEX idx_alerts_starts_at ON public.alerts(starts_at DESC);

-- ============================================================
-- TABELA: climate_data
-- Dados de estações meteorológicas INMET
-- ============================================================
CREATE TABLE public.climate_data (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  station_code TEXT NOT NULL,        -- código INMET (ex: A807)
  station_name TEXT NOT NULL,
  municipality TEXT,
  ibge_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  temperature DOUBLE PRECISION,      -- °C
  humidity DOUBLE PRECISION,         -- %
  pressure DOUBLE PRECISION,         -- hPa
  wind_speed DOUBLE PRECISION,       -- m/s
  wind_direction INTEGER,            -- graus
  precipitation DOUBLE PRECISION,    -- mm/h
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_climate_station ON public.climate_data(station_code);
CREATE INDEX idx_climate_observed ON public.climate_data(observed_at DESC);
-- Manter apenas últimas 48h de dados por estação
CREATE UNIQUE INDEX idx_climate_station_time ON public.climate_data(station_code, observed_at);

-- ============================================================
-- TABELA: news_items
-- Notícias de RSS feeds e ALEP
-- ============================================================
CREATE TABLE public.news_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source TEXT NOT NULL,              -- 'gazeta', 'g1pr', 'aen', 'bandab', 'gnews', 'alep'
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL UNIQUE,
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  urgency TEXT DEFAULT 'normal'
    CHECK (urgency IN ('urgent', 'important', 'normal')),
  category TEXT,
  keywords TEXT[],
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_source ON public.news_items(source);
CREATE INDEX idx_news_published ON public.news_items(published_at DESC);
CREATE INDEX idx_news_urgency ON public.news_items(urgency);

-- Limpeza automática: manter apenas 7 dias de notícias
CREATE OR REPLACE FUNCTION public.cleanup_old_news()
RETURNS void AS $$
BEGIN
  DELETE FROM public.news_items WHERE published_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA: dengue_data
-- Dados InfoDengue por município
-- ============================================================
CREATE TABLE public.dengue_data (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ibge_code TEXT NOT NULL,
  municipality_name TEXT,
  epidemiological_week INTEGER NOT NULL,
  year INTEGER NOT NULL,
  cases INTEGER DEFAULT 0,
  cases_est DOUBLE PRECISION,        -- estimativa com IC
  alert_level INTEGER DEFAULT 0      -- 0=verde 1=amarelo 2=laranja 3=vermelho
    CHECK (alert_level BETWEEN 0 AND 3),
  incidence_rate DOUBLE PRECISION,   -- casos/100k habitantes
  population INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ibge_code, year, epidemiological_week)
);

CREATE INDEX idx_dengue_ibge ON public.dengue_data(ibge_code);
CREATE INDEX idx_dengue_week ON public.dengue_data(year DESC, epidemiological_week DESC);
CREATE INDEX idx_dengue_alert ON public.dengue_data(alert_level);

-- ============================================================
-- TABELA: fire_spots
-- Focos de calor NASA FIRMS
-- ============================================================
CREATE TABLE public.fire_spots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  brightness DOUBLE PRECISION,       -- temperatura de brilho
  scan DOUBLE PRECISION,
  track DOUBLE PRECISION,
  acq_date DATE NOT NULL,
  acq_time TEXT,
  satellite TEXT,                    -- 'N' = NOAA-20, 'T' = Terra, 'A' = Aqua
  instrument TEXT DEFAULT 'VIIRS',
  confidence TEXT,                   -- 'low', 'nominal', 'high'
  municipality TEXT,
  ibge_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fire_acq_date ON public.fire_spots(acq_date DESC);
CREATE INDEX idx_fire_location ON public.fire_spots(latitude, longitude);

-- ============================================================
-- TABELA: river_levels
-- Nível de rios ANA Telemetria
-- ============================================================
CREATE TABLE public.river_levels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  station_code TEXT NOT NULL,
  station_name TEXT NOT NULL,
  river_name TEXT,
  municipality TEXT,
  ibge_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  level_cm DOUBLE PRECISION,         -- nível em cm
  flow_m3s DOUBLE PRECISION,         -- vazão m³/s (se disponível)
  alert_level TEXT DEFAULT 'normal'
    CHECK (alert_level IN ('normal', 'attention', 'alert', 'emergency')),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_river_station ON public.river_levels(station_code);
CREATE INDEX idx_river_observed ON public.river_levels(observed_at DESC);

-- ============================================================
-- TABELA: air_quality
-- Qualidade do ar AQICN/WAQI
-- ============================================================
CREATE TABLE public.air_quality (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  city TEXT NOT NULL,               -- 'curitiba', 'londrina', 'maringa', 'foz'
  station_name TEXT,
  aqi INTEGER,                      -- Air Quality Index
  dominant_pollutant TEXT,
  pm25 DOUBLE PRECISION,
  pm10 DOUBLE PRECISION,
  o3 DOUBLE PRECISION,
  no2 DOUBLE PRECISION,
  co DOUBLE PRECISION,
  so2 DOUBLE PRECISION,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_aq_city ON public.air_quality(city);
CREATE INDEX idx_aq_observed ON public.air_quality(observed_at DESC);

-- ============================================================
-- TABELA: legislative_items
-- Dados ALEP (projetos de lei, sessões)
-- ============================================================
CREATE TABLE public.legislative_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  external_id TEXT UNIQUE,
  type TEXT NOT NULL,               -- 'projeto_lei', 'sessao', 'votacao', 'noticia'
  number TEXT,
  year INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  status TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_legis_type ON public.legislative_items(type);
CREATE INDEX idx_legis_published ON public.legislative_items(published_at DESC);
