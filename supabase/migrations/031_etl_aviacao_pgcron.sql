-- Migration 031: schedule ETL aviacao via pg_cron + pg_net (a cada 1min)
--
-- Substitui o GH Actions cron (que jitterava ate 90min) pelo pg_cron
-- nativo do Supabase, mais granular e confiavel. Chama a edge function
-- etl-aviacao por HTTP via pg_net.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Permitir cron jobs do schema cron acessarem net.* (pg_net)
GRANT USAGE ON SCHEMA net TO postgres;

-- Job: a cada 1min chama a edge function etl-aviacao.
-- Anon JWT no Authorization e o padrao Supabase para invocar functions
-- via HTTP. A function usa SUPABASE_SERVICE_ROLE_KEY internamente para
-- escrever em aviation_traffic.
SELECT cron.schedule(
  'etl-aviacao-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-aviacao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpYWx4amNzZ3l3dnZ1eGp4Y2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjczNTMsImV4cCI6MjA4Nzk0MzM1M30.e3X-LSPVUbxl-P9KLB9TuGB0nkmZ4OrNyHL9SuxaRgM'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
