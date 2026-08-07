-- Migration 036: frescor tambem a partir das tabelas de dominio.
--
-- A 034 assumiu que todo pipeline deixa rastro em data_cache. Falso: quatro
-- deles escrevem direto na tabela de dominio e nao gravam health record nenhum.
-- A consequencia era a view reportar `age_minutes = null` e `is_stale = true`
-- para pipelines que estao rodando normalmente:
--
--   noticias  -> public.news_items.fetched_at
--   dengue    -> public.dengue_projections.calculated_at
--   anomalies -> public.anomalies.detected_at
--   datasus   -> public.datasus_sih_ingestion_log.finished_at
--
-- Um monitor que da falso positivo e pior que monitor nenhum: treina a ignorar.
--
-- A lista e estatica de proposito. Uma view nao aceita nome de tabela dinamico,
-- e resolver com SQL dinamico exigiria uma funcao security definer -- muito
-- poder para o que e, na pratica, quatro linhas. Ao portar cada um destes ETLs
-- para Edge Function, ele passa a gravar health record via _shared/etl.ts e a
-- linha correspondente aqui pode sumir.

create or replace view etl.domain_freshness as
select 'noticias'::text  as etl_name, max(fetched_at)    as last_run from public.news_items
union all
select 'dengue',          max(calculated_at)             from public.dengue_projections
union all
select 'anomalies',       max(detected_at)               from public.anomalies
union all
select 'datasus',         max(finished_at)               from public.datasus_sih_ingestion_log;

comment on view etl.domain_freshness is
  'Frescor dos pipelines que escrevem so na tabela de dominio, sem passar por data_cache.';

grant select on etl.domain_freshness to service_role;

-- Recria a view principal considerando as tres origens de frescor:
-- health record, sources em data_cache e tabela de dominio.
create or replace view public.etl_freshness
with (security_invoker = true) as
select
  c.etl_name,
  c.runtime,
  c.cron_expr,
  c.cadence_minutes,
  greatest(f.last_run, d.last_run)                   as last_run,
  case
    when greatest(f.last_run, d.last_run) is null then null
    else round(
      extract(epoch from now() - greatest(f.last_run, d.last_run)) / 60
    )::integer
  end                                                as age_minutes,
  h.data ->> 'status'                                as last_status,
  case
    when c.cadence_minutes is null then false
    when greatest(f.last_run, d.last_run) is null then true
    else now() - greatest(f.last_run, d.last_run)
         > make_interval(mins => c.cadence_minutes * 2)
  end                                                as is_stale
from etl.expected_cadence c
left join lateral (
  select max(dc.fetched_at) as last_run
  from public.data_cache dc
  where dc.cache_key = c.health_key
     or dc.source = any (c.source_names)
) f on true
left join etl.domain_freshness d on d.etl_name = c.etl_name
left join public.data_cache h on h.cache_key = c.health_key;

comment on view public.etl_freshness is
  'Frescor de cada pipeline. last_run e o mais recente entre health record, sources em data_cache e tabela de dominio.';

-- etl_stale seleciona de etl_freshness, entao herda a correcao. Recriada apenas
-- para nao depender da ordem de resolucao de dependencias.
create or replace view public.etl_stale
with (security_invoker = true) as
select *
from public.etl_freshness
where is_stale
order by age_minutes desc nulls first;

revoke all on public.etl_freshness from anon, authenticated;
revoke all on public.etl_stale     from anon, authenticated;
grant select on public.etl_freshness to service_role;
grant select on public.etl_stale     to service_role;
