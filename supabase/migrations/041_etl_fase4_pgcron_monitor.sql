-- Migration 041: Fase 4 (etl-agro) + monitor de pipelines atrasados (Fase 5).
--
-- etl-agro: semanal, segunda 8h UTC, mesma cadência do Actions. SICOR faz 5
-- chamadas (uma por ano da série), por isso o timeout de 180 s.
--
-- etl-stale-monitor: fecha o item "alerta automático" da Fase 5 do plano.
-- Job HORÁRIO, todo minuto 5, que consulta public.etl_stale e grava uma
-- notification in_app por pipeline atrasado -- com dedup de 6 h por
-- pipeline para não virar spam enquanto o problema persiste. DB-only, sem
-- Edge Function: se as functions caírem, o monitor continua de pé (que é
-- exatamente quando ele mais importa).
--
-- Exceções permanentes de runtime (datasus, getec) continuam em
-- github-actions no etl.expected_cadence: o monitor cobre todos igualmente
-- porque a view calcula frescor por dados, não por runtime.

select cron.unschedule(jobname)
from cron.job
where jobname in ('etl-agro', 'etl-stale-monitor');

select cron.schedule(
  'etl-agro',
  '0 8 * * 1',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-agro',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-stale-monitor',
  '5 * * * *',
  $$
  insert into public.notifications (channel, title, body, severity, metadata)
  select
    'in_app',
    'Pipeline atrasado: ' || s.etl_name,
    'O pipeline ' || s.etl_name || ' esta ha ' || s.age_minutes ||
      ' min sem atualizar (cadencia esperada: ' || s.cadence_minutes || ' min, runtime: ' ||
      coalesce(s.runtime, '?') || ').',
    case when s.age_minutes > s.cadence_minutes * 6 then 'high' else 'medium' end,
    jsonb_build_object(
      'domain', 'etl_monitor',
      'etl_name', s.etl_name,
      'age_minutes', s.age_minutes,
      'cadence_minutes', s.cadence_minutes,
      'source', 'pg_cron etl-stale-monitor'
    )
  from public.etl_stale s
  where not exists (
    select 1
    from public.notifications n
    where n.metadata->>'domain' = 'etl_monitor'
      and n.metadata->>'etl_name' = s.etl_name
      and n.sent_at > now() - interval '6 hours'
  );
  $$
);

update etl.expected_cadence
   set runtime = 'supabase-edge'
 where etl_name = 'agro';
