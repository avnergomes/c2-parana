-- Manutenção 2026-09-21: destrava o pg_net e os ETLs (aviação, clima, alertas...).
--
-- Diagnóstico: o worker do pg_net ficou preso numa transação; net._http_response
-- inchou para 199 MB (~384 linhas vivas, sem autovacuum desde 05/08) e a limpeza
-- automática dele varria a tabela inteira a cada execução, saturando o disco.
-- Com isso os upserts do etl-aviacao estouravam o statement timeout, o pg_cron
-- falhava ao iniciar jobs e as chamadas acumuladas disparavam em rajada.
--
-- Aplicado em 21/09: só os passos 3 (agendamento) e 4. O TRUNCATE nunca pegou a
-- trava; quem resolveu foi o autovacuum de net._http_response (199 -> 129 MB,
-- 82 mil linhas mortas removidas, terminou 16:08 UTC). Não rodar o arquivo
-- inteiro de novo: o pedido de trava do TRUNCATE faz o autovacuum desistir.

-- 1) solta o worker preso (o Postgres sobe outro sozinho)
select pg_terminate_backend(pid) from pg_stat_activity where backend_type like 'pg_net%worker';

-- 2) esvazia as respostas HTTP transitórias (o pg_net já as apaga após 6 h)
set lock_timeout = '20s';
truncate net._http_response;

-- 3) histórico do pg_cron: manter 7 dias, com limpeza diária
delete from cron.job_run_details where end_time < now() - interval '7 days';
select cron.schedule('limpa-cron-historico', '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 4) aviação: não enfileirar nova chamada enquanto houver uma pendente
select cron.alter_job(
  (select jobid from cron.job where jobname = 'etl-aviacao-every-minute'),
  command := $$select net.http_post(
    url := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-aviacao',
    headers := etl.trigger_headers(), body := '{}'::jsonb, timeout_milliseconds := 30000)
  where not exists (select 1 from net.http_request_queue where url like '%/etl-aviacao%')$$);

-- conferência
select pg_size_pretty(pg_total_relation_size('net._http_response')) as http_response,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as cron_historico;
