-- Migration 042: agenda o etl-meteo-grade em pg_cron (a cada 30 min).
--
-- Grade Open-Meteo 22x15 (vento a 10 m + precipitacao) sobre o PR, gravada em
-- data_cache (`meteo_grade_pr`) para as camadas de ventos e precipitacao do
-- DGP Comando. Antes o proprio browser buscava os 330 pontos por visitante e
-- estourava o limite por IP da Open-Meteo (429/503).
--
-- Custo de cota: a funcao so chama a API quando a previsao 15-minutal
-- guardada (`meteo_grade_pr_forecast`) nao cobre a proxima meia hora ou
-- passou de 110 min, o que da ~12 buscas/dia x 330 pontos = ~3.960
-- chamadas/dia, abaixo das 10.000/dia do plano gratuito mesmo somando o
-- etl-clima (~1.150/dia). Os demais runs apenas avancam o slot vigente.
--
-- Depende da 034 (etl.trigger_headers + etl.expected_cadence).
-- Idempotente: unschedule antes de schedule.

select cron.unschedule(jobname)
from cron.job
where jobname = 'etl-meteo-grade';

select cron.schedule(
  'etl-meteo-grade',
  '2,32 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-meteo-grade',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

insert into etl.expected_cadence
  (etl_name, cron_expr, cadence_minutes, runtime, health_key, source_names, notes)
values
  ('meteo_grade', '2,32 * * * *', 30, 'supabase-edge', 'etl_health_meteo_grade',
   '{etl_meteo_grade}', 'migration 042, Open-Meteo minutely_15 -> meteo_grade_pr (DGP Comando)')
on conflict (etl_name) do update set
  cron_expr       = excluded.cron_expr,
  cadence_minutes = excluded.cadence_minutes,
  runtime         = excluded.runtime,
  health_key      = excluded.health_key,
  source_names    = excluded.source_names,
  notes           = excluded.notes;
