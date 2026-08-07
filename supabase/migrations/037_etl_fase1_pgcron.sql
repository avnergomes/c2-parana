-- Migration 037: agenda os ETLs da Fase 1 em pg_cron.
--
-- Cadências idênticas às dos workflows do GitHub Actions, que continuam ativos
-- por 24-48 h como backup (passo 7 do checklist de cutover). O dual-run é
-- seguro: escalation e alerts são idempotentes por natureza (só agem quando a
-- condição é atendida, e respeitam cooldown/escalation_count), e cemaden faz
-- upsert por (alert_code, issued_at).
--
-- Timeouts: 2x o tempo medido na invocação real de 2026-08-07, com piso de
-- 30 s conforme o template. Medidos: escalation 1,1 s | alerts 2,2 s |
-- cemaden 0,66 s. O piso domina, e é folgado de propósito -- Edge Function em
-- cold start leva alguns segundos a mais.
--
-- etl-maritimo NÃO é agendada aqui de propósito: a fonte AISStream está
-- entregando zero frames desde 2026-08-02 (verificado com bbox mundial).
-- Agendar um pipeline cuja fonte está morta só produz ruído no monitor.
--
-- Depende da 034 (etl.trigger_headers) e do segredo `etl_trigger_token` no
-- Vault, sem o qual as chamadas voltam 401.

-- Idempotente: permite reaplicar sem duplicar jobs.
select cron.unschedule(jobname)
from cron.job
where jobname in ('etl-escalation', 'etl-alerts', 'etl-cemaden');

select cron.schedule(
  'etl-escalation',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-escalation',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-alerts',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-alerts',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-cemaden',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-cemaden',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

update etl.expected_cadence
   set runtime = 'supabase-edge'
 where etl_name in ('escalation', 'alerts', 'cemaden');
