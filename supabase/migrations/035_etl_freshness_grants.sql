-- Migration 035: grants faltantes para as views de frescor da 034.
--
-- As views public.etl_freshness / public.etl_stale foram criadas com
-- `security_invoker = true`, justamente para que o RLS de data_cache valha para
-- quem consulta em vez de rodar com os privilegios do dono. O efeito colateral
-- e que o chamador precisa de acesso a TODAS as relacoes de base, inclusive
-- etl.expected_cadence -- e o schema etl nao concedia nada a ninguem.
--
-- Sintoma: `select * from public.etl_freshness` com service_role devolvia
-- 42501 "permission denied for table expected_cadence".
--
-- Concede o minimo: USAGE no schema e SELECT na tabela, so para service_role.
-- anon e authenticated continuam sem acesso, que e o objetivo (a view expoe
-- agregados de data_cache).

grant usage on schema etl to service_role;
grant select on etl.expected_cadence to service_role;

-- Novas tabelas criadas no schema etl no futuro nao herdam grants; deixar
-- explicito para nao repetir o mesmo bug.
alter default privileges in schema etl grant select on tables to service_role;

revoke all on schema etl from anon, authenticated;
