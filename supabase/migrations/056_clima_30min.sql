-- Migration 056: etl-clima de 15 para 30 min (2026-10-28).
-- As 12 estacoes publicam ~8 leituras novas por dia; rodar a cada 15 min so
-- regravava as mesmas linhas. Minutos 9 e 39 fogem de alerts/cemaden (0,30).

select cron.alter_job(jobid, schedule := '9,39 * * * *')
  from cron.job where jobname = 'etl-clima-every-15min';

update etl.expected_cadence
   set cron_expr = '9,39 * * * *', cadence_minutes = 30
 where etl_name = 'clima';
