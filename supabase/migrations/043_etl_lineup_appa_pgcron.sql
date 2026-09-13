-- Migration 043: agenda o etl-lineup-appa em pg_cron (a cada 30 min).
--
-- Line-up oficial dos Portos de Paranaguá e Antonina (APPA, relatório HTML
-- público) -> data_cache `appa_lineup_pr`, lido pelo DGP Comando na camada
-- marítima. Substitui na prática a AISStream, que não tem cobertura de
-- receptores na costa do PR (diagnóstico de 2026-09-13).
--
-- Minutos 12 e 42: fora dos horários do etl-clima (0/15/30/45) e do
-- etl-meteo-grade (2/32). Uma requisição HTTP por run à APPA.
--
-- Depende da 034 (etl.trigger_headers + etl.expected_cadence).
-- Idempotente: unschedule antes de schedule.

select cron.unschedule(jobname)
from cron.job
where jobname = 'etl-lineup-appa';

select cron.schedule(
  'etl-lineup-appa',
  '12,42 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-lineup-appa',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) as request_id;
  $$
);

insert into etl.expected_cadence
  (etl_name, cron_expr, cadence_minutes, runtime, health_key, source_names, notes)
values
  ('lineup_appa', '12,42 * * * *', 30, 'supabase-edge', 'etl_health_lineup_appa',
   '{etl_lineup_appa}', 'migration 043, line-up APPA (HTML) -> appa_lineup_pr (DGP Comando)')
on conflict (etl_name) do update set
  cron_expr       = excluded.cron_expr,
  cadence_minutes = excluded.cadence_minutes,
  runtime         = excluded.runtime,
  health_key      = excluded.health_key,
  source_names    = excluded.source_names,
  notes           = excluded.notes;
