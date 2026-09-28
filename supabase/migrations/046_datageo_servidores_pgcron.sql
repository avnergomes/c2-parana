-- Migration 046: agenda o datageo-servidores em pg_cron (de hora em hora).
--
-- Servidores do IDR-Paraná (relatório do SisPont + Relação de Servidores do
-- Portal da Transparência PR) -> bucket privado datageo-privado/
-- servidores-idr.json, lido pelo DataGeo (ficha municipal: extensionistas;
-- camada de estações de pesquisa). Sem RG nem chefia no arquivo.
--
-- Minuto 7: fora do etl-clima (0/15/30/45), etl-meteo-grade (2/32) e
-- etl-lineup-appa (12/42). Três requisições HTTP por run (SisPont 2x, Portal 1x).
--
-- Depende da 034 (etl.trigger_headers + etl.expected_cadence).
-- Idempotente: unschedule antes de schedule.

select cron.unschedule(jobname)
from cron.job
where jobname = 'datageo-servidores';

select cron.schedule(
  'datageo-servidores',
  '7 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/datageo-servidores',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  ) as request_id;
  $$
);

insert into etl.expected_cadence
  (etl_name, cron_expr, cadence_minutes, runtime, health_key, source_names, notes)
values
  ('datageo_servidores', '7 * * * *', 60, 'supabase-edge', 'etl_health_datageo_servidores',
   '{datageo_servidores}', 'migration 046, SisPont + Portal da Transparência -> datageo-privado/servidores-idr.json')
on conflict (etl_name) do update set
  cron_expr       = excluded.cron_expr,
  cadence_minutes = excluded.cadence_minutes,
  runtime         = excluded.runtime,
  health_key      = excluded.health_key,
  source_names    = excluded.source_names,
  notes           = excluded.notes;
