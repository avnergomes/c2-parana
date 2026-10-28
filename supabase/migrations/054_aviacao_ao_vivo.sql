-- Migration 054: trafego aereo sai do banco (2026-10-28).
--
-- aviation_traffic recebia ~700 linhas/min com 7 dias de retencao (5,2 mi
-- inserts, 4,7 mi deletes) e era o maior consumidor de disk IO do projeto.
-- O DataGeo agora le o adsb.lol ao vivo pela Edge Function aviacao-live,
-- sem gravar nada. Aplicar SO depois do deploy da aviacao-live e do front.
--
-- A tabela fica (vazia) porque o hook useTrafego do C2 descontinuado ainda
-- a referencia. TRUNCATE devolve o espaco na hora; VACUUM nao e necessario.

select cron.unschedule(jobname) from cron.job where jobname = 'etl-aviacao-every-minute';

-- Sem cadencia = o etl-stale-monitor para de cobrar o pipeline.
update etl.expected_cadence
   set cadence_minutes = null,
       notes = 'desligado em 2026-10-28: substituido pela Edge Function aviacao-live (sem banco)'
 where etl_name = 'aviacao';

truncate table public.aviation_traffic;
