-- Migration 057: agenda o etl-manejo em pg_cron (uma vez por dia).
--
-- Relatórios do Manejo.App (grupo IDR-Paraná) -> bucket privado datageo-privado/
-- manejo-*.geojson, lidos pelas camadas Manejo do DataGeo. Nome de produtor e
-- coordenada exata: nada vai para data_cache além do health (contagens).
--
-- 09:17 UTC = 06:17 em Brasília; minuto 17 fora dos demais jobs.
--
-- Depende da 034 (etl.trigger_headers + etl.expected_cadence).
-- Idempotente: unschedule antes de schedule.

select cron.unschedule(jobname)
from cron.job
where jobname = 'etl-manejo';

select cron.schedule(
  'etl-manejo',
  '17 9 * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-manejo',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  ) as request_id;
  $$
);

insert into etl.expected_cadence
  (etl_name, cron_expr, cadence_minutes, runtime, health_key, source_names, notes)
values
  ('manejo', '17 9 * * *', 1440, 'supabase-edge', 'etl_health_manejo',
   '{etl_manejo}', 'migration 057, Manejo.App (IDR) -> datageo-privado/manejo-*.geojson')
on conflict (etl_name) do update set
  cron_expr       = excluded.cron_expr,
  cadence_minutes = excluded.cadence_minutes,
  runtime         = excluded.runtime,
  health_key      = excluded.health_key,
  source_names    = excluded.source_names,
  notes           = excluded.notes;
