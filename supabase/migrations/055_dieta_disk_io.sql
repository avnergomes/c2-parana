-- Migration 055: dieta de disk IO para o plano gratuito (2026-10-28).
--
-- Desliga os pipelines que so alimentavam o C2 (descontinuado). Nenhum
-- deles e lido pelo DataGeo (conferido em datageo-command/src):
--   etl-escalation   */15  incidents.escalation_count + notifications
--   etl-legislativo  dias uteis  legislative_items
--   etl-healthcare   diario  data_cache datasus_cnes_reference (a camada CNES do DataGeo e estatica)
--   etl-agro         semanal data_cache vbp_* / comex / sicor / cempre
--   etl-agua         6/6h    data_cache infohidro_reservatorios_pr / mananciais_pr
--   etl-stale-monitor 1/h    notifications "Pipeline atrasado" (so a UI do C2 mostrava)
-- Para religar um deles: recriar o job a partir da migration de origem
-- (038/040/041) e voltar o cadence_minutes.
--
-- Junto com isso, os workflows cron-*.yml do GitHub Actions perderam o
-- schedule: rodavam os mesmos ETLs do pg_cron e dobravam as escritas.

select cron.unschedule(jobname) from cron.job
 where jobname in ('etl-escalation', 'etl-legislativo', 'etl-healthcare',
                   'etl-agro', 'etl-agua', 'etl-stale-monitor');

update etl.expected_cadence
   set cadence_minutes = null,
       notes = 'desligado em 2026-10-28 (055): so alimentava o C2 descontinuado'
 where etl_name in ('escalation', 'legislativo', 'healthcare', 'agro', 'agua');
