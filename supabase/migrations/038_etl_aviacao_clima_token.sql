-- Migration 038: reagenda aviacao e clima com o header de token.
--
-- ORDEM OBRIGATÓRIA. Esta migration precisa ser aplicada ANTES do deploy das
-- versões refatoradas de etl-aviacao e etl-clima. Motivo:
--
--   - o secret ETL_TRIGGER_TOKEN já existe no projeto, então o assertEtlToken
--     do _shared/etl.ts passa a devolver 401 para chamadas sem x-etl-token;
--   - os jobs criados pelas migrations 031 e 032 mandam apenas
--     `Authorization: Bearer <anon>`, sem x-etl-token.
--
-- Deployar as funções primeiro derrubaria os dois únicos pipelines que hoje
-- rodam no Supabase. Aplicando esta migration antes, o header já vai junto e o
-- código antigo simplesmente o ignora -- a troca fica sem janela de queda.
--
-- Mantém as cadências das 031/032 e troca o header por etl.trigger_headers(),
-- que também elimina a anon key hardcoded em SQL versionado (a 032 tinha o JWT
-- inteiro em texto claro).
--
-- Os nomes dos jobs vêm de `select jobname from cron.job`, conferidos em
-- 2026-08-07: 'etl-aviacao-every-minute' e 'etl-clima-every-15min'.

select cron.unschedule(jobname)
from cron.job
where jobname in ('etl-aviacao-every-minute', 'etl-clima-every-15min');

-- Aviação: cadência de 1 min. A 031 usava 3 schedules com offset para cadência
-- sub-minuto; hoje o cron.job tem só o de 1 min, então é esse que se preserva.
select cron.schedule(
  'etl-aviacao-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-aviacao',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

select cron.schedule(
  'etl-clima-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-clima',
    headers := etl.trigger_headers(),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
