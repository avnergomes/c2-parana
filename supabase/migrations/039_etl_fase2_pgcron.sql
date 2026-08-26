-- Migration 039: agenda os ETLs da Fase 2 em pg_cron.
--
-- Cadências idênticas às dos workflows do GitHub Actions (seção 4 do plano
-- de migração), que continuam ativos por 24-48 h como backup (passo 7 do
-- checklist de cutover). Dual-run é seguro: todos são DB->DB ou upserts
-- idempotentes (noticias por url; irtc por ibge_code; dengue faz full
-- refresh por calculated_at; situational por report_date; anomalies por
-- chave composta com detected_at; correlations respeita cooldown).
--
-- Timeouts: 2x o tempo estimado com piso de 30 s. dengue pagina ~29 mil
-- linhas e leva mais; noticias depende de 5 feeds externos.
--
-- Depende da 034 (etl.trigger_headers) e do segredo etl_trigger_token no
-- Vault. Idempotente: unschedule antes de schedule.

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'etl-correlations', 'etl-noticias', 'etl-anomalies',
  'etl-irtc', 'etl-dengue', 'etl-situational'
);

select cron.schedule(
  'etl-correlations',
  '45 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-correlations',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-noticias',
  '0 */2 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-noticias',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-anomalies',
  '45 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-anomalies',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-irtc',
  '30 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-irtc',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-dengue',
  '0 10 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-dengue',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-situational',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-situational',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

update etl.expected_cadence
   set runtime = 'supabase-edge'
 where etl_name in ('correlations', 'noticias', 'anomalies', 'irtc', 'dengue', 'situational');
