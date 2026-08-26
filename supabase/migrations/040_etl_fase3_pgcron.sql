-- Migration 040: agenda os ETLs da Fase 3 em pg_cron.
--
-- Cadências idênticas às dos workflows do GitHub Actions (seção 4 do plano
-- de migração), que continuam ativos por 24-48 h como backup (passo 7).
--
-- etl-saude reproduz os DOIS modos do cron do Actions:
--   fast  (top-50)  qua/sex 12h UTC  -> ?mode=fast
--   full  (399)     segunda 8h UTC   -> ?mode=full em 3 lotes (?batch=1|2|3)
-- com offsets de 10 min, padrão da migration 031 do etl-aviacao. O
-- particionamento existe para caber no wall-clock de Edge Function
-- (~133 municípios por invocação, medido ~2 min cada).
--
-- Timeouts: fetchers externos com retries embutidos; ambiente e infohidro
-- fazem dezenas/centenas de requests sequenciais e recebem 300 s.

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'etl-agua', 'etl-ambiente', 'etl-infohidro', 'etl-healthcare',
  'etl-legislativo', 'etl-saude-fast',
  'etl-saude-full-1', 'etl-saude-full-2', 'etl-saude-full-3'
);

select cron.schedule(
  'etl-agua',
  '30 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-agua',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-ambiente',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-ambiente',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-infohidro',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/scrape-infohidro',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-healthcare',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-healthcare',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- ALEP responde melhor em horário comercial: manter 14h UTC seg-sex.
select cron.schedule(
  'etl-legislativo',
  '0 14 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-legislativo',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-saude-fast',
  '0 12 * * 3,5',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-saude?mode=fast',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-saude-full-1',
  '0 8 * * 1',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-saude?mode=full&batch=1',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-saude-full-2',
  '10 8 * * 1',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-saude?mode=full&batch=2',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-saude-full-3',
  '20 8 * * 1',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-saude?mode=full&batch=3',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

update etl.expected_cadence
   set runtime = 'supabase-edge'
 where etl_name in ('agua', 'ambiente', 'infohidro', 'healthcare', 'legislativo', 'saude');
