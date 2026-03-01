# 02 — SUPABASE SETUP: Schema, RLS e Edge Functions

## Descrição
Configura toda a infraestrutura Supabase: banco de dados PostgreSQL com schema completo, políticas de Row Level Security, scaffold das Edge Functions para Stripe, e instruções de configuração no dashboard.

## Pré-requisitos
- Prompt 01 concluído (projeto criado)
- Conta no Supabase (supabase.com)
- Projeto Supabase criado (FREE tier suficiente para MVP)
- Supabase CLI instalado: `npm install -g supabase`

## Variáveis de Ambiente Necessárias
```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
# Para Edge Functions e scripts:
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (Settings → API → service_role)
```

---

## Prompt para o Claude Code

```
Vou configurar o Supabase para o projeto C2 Paraná. Execute os passos abaixo.

## PASSO 1: Inicializar Supabase CLI no projeto

Na pasta raiz do projeto c2-parana:

supabase init
supabase login    # abre browser para autenticação
supabase link --project-ref SEU_PROJECT_REF   # Project ref está na URL do dashboard

## PASSO 2: Criar migration 001 — Schema inicial

Crie o arquivo supabase/migrations/001_initial_schema.sql com o conteúdo EXATO abaixo:

```sql
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
```

## PASSO 3: Criar migration 002 — Políticas RLS

Crie supabase/migrations/002_rls_policies.sql:

```sql
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
```

## PASSO 4: Criar migration 003 — Functions auxiliares

Crie supabase/migrations/003_functions.sql:

```sql
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
```

## PASSO 5: Aplicar migrations

Execute:
supabase db push

Ou, manualmente no Supabase Dashboard (SQL Editor), cole e execute cada arquivo de migration.

## PASSO 6: Criar Edge Function — create-checkout

Crie supabase/functions/create-checkout/index.ts:

```typescript
// supabase/functions/create-checkout/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.15.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { plan, success_url, cancel_url } = await req.json()

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar JWT e pegar user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    })

    // Mapa de price IDs por plano (criar no Stripe dashboard e colocar aqui)
    const PRICE_IDS: Record<string, string> = {
      solo: Deno.env.get('STRIPE_PRICE_SOLO') || '',
      pro: Deno.env.get('STRIPE_PRICE_PRO') || '',
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verificar se já tem customer Stripe
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    let customerId = subscription?.stripe_customer_id

    if (!customerId) {
      // Criar customer no Stripe
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      // Salvar customer_id
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

    // Criar Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: success_url || `${req.headers.get('origin')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/pricing`,
      metadata: { user_id: user.id, plan },
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
      locale: 'pt-BR',
      currency: 'brl',
    })

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('create-checkout error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

## PASSO 7: Criar Edge Function — stripe-webhook

Crie supabase/functions/stripe-webhook/index.ts:

```typescript
// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.15.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
  })

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id
        const plan = session.metadata?.plan || 'solo'

        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            plan,
            trial_end: null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id

        if (userId) {
          await supabase.from('subscriptions').update({
            status: sub.status as any,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

        await supabase.from('subscriptions').update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(JSON.stringify({ error: 'Handler failed' }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

## PASSO 8: Configurar secrets das Edge Functions

Execute:
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_SOLO=price_...
supabase secrets set STRIPE_PRICE_PRO=price_...

## PASSO 9: Deploy das Edge Functions

supabase functions deploy create-checkout
supabase functions deploy stripe-webhook

## PASSO 10: Configurar Auth no Dashboard Supabase

No Supabase Dashboard → Authentication → Settings:

1. **Site URL**: https://avnergomes.github.io/c2-parana
2. **Redirect URLs** (adicionar todas):
   - http://localhost:3000/**
   - https://avnergomes.github.io/c2-parana/**
3. **Email confirmação**: ATIVAR "Confirm email"
4. **Google OAuth**:
   - Authentication → Providers → Google → Enable
   - Client ID e Client Secret: obter em console.cloud.google.com
   - Authorized redirect URI no Google: https://[project].supabase.co/auth/v1/callback

## PASSO 11: Criar src/lib/supabase.ts COMPLETO

Substitua o arquivo src/lib/supabase.ts:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios no .env.local')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'c2-parana-auth',
  },
  global: {
    headers: { 'x-application': 'c2-parana' },
  },
})

// Helper para chamar Edge Functions
export async function callEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw error
  return data as T
}
```

## PASSO 12: Gerar tipos TypeScript do banco

Após aplicar as migrations:
supabase gen types typescript --linked > src/types/supabase.ts

Se não tiver Supabase CLI local, use o dashboard:
Dashboard → Database → API → Generate TypeScript Types
```

---

## Arquivos Criados/Modificados

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql         (CRIADO)
│   ├── 002_rls_policies.sql           (CRIADO)
│   └── 003_functions.sql              (CRIADO)
└── functions/
    ├── create-checkout/
    │   └── index.ts                   (CRIADO)
    └── stripe-webhook/
        └── index.ts                   (CRIADO)
src/lib/supabase.ts                    (SUBSTITUÍDO)
src/types/supabase.ts                  (GERADO pelo CLI)
```

---

## Verificação

1. `supabase db push` sem erros
2. No Dashboard → Table Editor: verificar tabelas `profiles`, `subscriptions`, `data_cache`, `alerts`, `climate_data`, `news_items`, `dengue_data`, `fire_spots`, `river_levels`, `air_quality`, `legislative_items`
3. `supabase functions deploy create-checkout` sem erros
4. Testar Edge Function: `curl -X POST https://[project].supabase.co/functions/v1/create-checkout -H "Authorization: Bearer [anon_key]"` → deve retornar `{"error":"Unauthorized"}` (correto — precisa de JWT de usuário)

---

## Notas Técnicas

- **service_role key**: Jamais expor no frontend. Usada apenas em Edge Functions (server-side) e scripts Python dos crons. A `anon_key` é segura para o frontend pois as RLS policies protegem os dados.
- **Trial como pro**: O trial de 14 dias dá acesso ao plano Pro completo. Após expirar, o usuário precisa assinar para continuar. Isso maximiza a conversão ao mostrar todos os recursos.
- **Trigger on_profile_created**: O encadeamento `auth.users → profiles → subscriptions` via triggers garante que todo novo usuário automaticamente recebe um trial de 14 dias, sem lógica no frontend.
- **RLS em data_cache**: Todos os usuários autenticados leem todos os dados de cache — os dados são públicos por natureza (APIs governamentais). A granularidade de acesso (plano Pro vs Solo) é implementada no frontend via feature flags, não no banco.
- **Limpeza de dados**: A função `cleanup_old_news()` deve ser chamada periodicamente. Adicionar ao cron de notícias (ETL) ou criar um Supabase pg_cron job.
