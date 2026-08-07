-- Migration 034: fundacao da migracao dos ETLs para Supabase (Fase 0)
--
-- Cria:
--   1. schema `etl` (nao exposto via PostgREST) com o helper de headers de
--      disparo, que le o token do Vault em vez de hardcodar segredo em SQL;
--   2. tabela `etl.expected_cadence` com a cadencia esperada de cada pipeline;
--   3. views `public.etl_freshness` e `public.etl_stale` para auditoria de
--      frescor (o produto do DataGeo PR e dado fresco; frescor precisa ser
--      observavel em uma query).
--
-- Pre-requisito manual (uma vez, no SQL Editor, NAO versionar o valor):
--   select vault.create_secret('<token-hex-32-bytes>', 'etl_trigger_token');
-- O mesmo valor vai para o secret ETL_TRIGGER_TOKEN das Edge Functions.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1. Schema etl + headers de disparo
-- ---------------------------------------------------------------------------

create schema if not exists etl;

comment on schema etl is
  'Infra interna dos pipelines de ETL. Nao exposto via PostgREST (ver supabase/config.toml).';

-- Headers usados por todo job pg_cron que chama uma Edge Function de ETL.
--
-- security definer + search_path vazio: o job roda como postgres e precisa ler
-- vault.decrypted_secrets, mas a funcao nao pode ser sequestrada por search_path.
-- Se o secret ainda nao existir, devolve os headers sem o token; a Edge Function
-- so exige o token quando ELA tambem tem ETL_TRIGGER_TOKEN configurado, entao a
-- ordem de rollout (vault antes ou depois) nao quebra nada.
create or replace function etl.trigger_headers()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-etl-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'etl_trigger_token'
        limit 1
      )
    )
  );
$$;

revoke all on function etl.trigger_headers() from public, anon, authenticated;

comment on function etl.trigger_headers() is
  'Headers padrao de disparo de ETL. Le o token de vault.decrypted_secrets.';

-- ---------------------------------------------------------------------------
-- 2. Cadencia esperada por pipeline
-- ---------------------------------------------------------------------------

create table if not exists etl.expected_cadence (
  etl_name          text primary key,
  cron_expr         text,
  cadence_minutes   integer,          -- null = disparo manual, nao monitorar
  runtime           text not null default 'github-actions'
                      check (runtime in ('supabase-edge', 'github-actions', 'manual')),
  health_key        text not null,    -- cache_key do health record
  source_names      text[] not null default '{}',  -- sources em data_cache
  notes             text
);

comment on table etl.expected_cadence is
  'Cadencia esperada de cada pipeline. Alimenta as views de frescor. Atualizar a coluna runtime a cada cutover.';
comment on column etl.expected_cadence.source_names is
  'Sources gravados em data_cache. O frescor usa o maior fetched_at entre o health record e essas sources, para nao depender do health (os scripts Python deletam o proprio health em caso de sucesso).';

insert into etl.expected_cadence
  (etl_name, cron_expr, cadence_minutes, runtime, health_key, source_names, notes)
values
  ('aviacao',      '* * * * *',        5,     'supabase-edge',  'etl_health_aviacao',      '{etl_aviacao}',            'migration 031, 3 schedules com offset'),
  ('clima',        '*/15 * * * *',     15,    'supabase-edge',  'etl_health_clima',        '{etl_clima}',              'migration 032, Open-Meteo'),
  ('maritimo',     '*/10 * * * *',     10,    'github-actions', 'etl_health_maritimo',     '{etl_maritimo}',           'EF deployada mas coletando 0 embarcacoes'),
  ('escalation',   '*/15 * * * *',     15,    'github-actions', 'etl_health_escalation',   '{etl_incident_escalation}', 'DB->DB'),
  ('alerts',       '*/30 * * * *',     30,    'github-actions', 'etl_health_alerts',       '{etl_alerts_engine}',      'DB->DB'),
  ('cemaden',      '*/30 * * * *',     30,    'github-actions', 'etl_health_cemaden',      '{etl_cemaden}',            'REST CEMADEN'),
  ('correlations', '45 * * * *',       60,    'github-actions', 'etl_health_correlations', '{etl_correlations}',       'DB->DB'),
  ('noticias',     '0 */2 * * *',      120,   'github-actions', 'etl_health_noticias',     '{etl_noticias}',           'RSS'),
  ('anomalies',    '45 */6 * * *',     360,   'github-actions', 'etl_health_anomalies',    '{etl_anomalies}',          'DB->DB, z-score'),
  ('irtc',         '30 */6 * * *',     360,   'github-actions', 'etl_health_irtc',         '{etl_irtc}',               'DB->DB, indice composto'),
  ('agua',         '30 */6 * * *',     360,   'github-actions', 'etl_health_agua',         '{etl_agua}',               'REST InfoHidro/SIMEPAR'),
  ('ambiente',     '0 */6 * * *',      360,   'github-actions', 'etl_health_ambiente',     '{etl_ambiente}',           'NASA FIRMS + ANA + AQICN'),
  ('infohidro',    '0 */6 * * *',      360,   'github-actions', 'etl_health_infohidro',    '{etl_infohidro,infohidro_telemetry,infohidro_quality,infohidro_forecast,infohidro_simepar,infohidro_conservation}', 'scraper com login'),
  ('dengue',       '0 10 * * *',       1440,  'github-actions', 'etl_health_dengue',       '{etl_dengue_projections}', 'DB->DB'),
  ('situational',  '0 9 * * *',        1440,  'github-actions', 'etl_health_situational',  '{etl_situational_report}', 'DB->DB, snapshot diario'),
  ('healthcare',   '0 9 * * *',        1440,  'github-actions', 'etl_health_healthcare',   '{datasus_cnes_reference}', 'API aberta CNES'),
  ('legislativo',  '0 14 * * 1-5',     4320,  'github-actions', 'etl_health_legislativo',  '{etl_legislativo}',        'scraping ALEP; 4320min tolera o fim de semana'),
  ('saude',        '0 8 * * 1',        4320,  'github-actions', 'etl_health_saude',        '{etl_saude}',              'InfoDengue 399 municipios; full seg, fast qua/sex'),
  ('agro',         '0 8 * * 1',        10080, 'github-actions', 'etl_health_agro',         '{ibge_sidra,mdic_comexstat,bcb_sicor,ibge_cempre}', 'semanal'),
  ('getec',        '0 10 * * *',       1440,  'github-actions', 'etl_health_getec',        '{idr_getec_report}',       'PDF (pdfplumber); ver spike da Fase 4'),
  ('getec_extensao', null,             null,  'manual',         'etl_health_getec_extensao', '{idr_getec_extensao}',   'disparo manual'),
  ('datasus',      '0 2 5 * *',        44640, 'github-actions', 'etl_health_datasus',      '{datasus_sih}',            'EXCECAO PERMANENTE: pysus + DBC, impossivel em Deno')
on conflict (etl_name) do update set
  cron_expr       = excluded.cron_expr,
  cadence_minutes = excluded.cadence_minutes,
  health_key      = excluded.health_key,
  source_names    = excluded.source_names,
  notes           = excluded.notes;

-- ---------------------------------------------------------------------------
-- 3. Views de frescor
-- ---------------------------------------------------------------------------

-- security_invoker: a view aplica o RLS de data_cache do chamador em vez de
-- rodar com os privilegios do dono. Sem isso, uma view em public vazaria o
-- data_cache inteiro para anon.
create or replace view public.etl_freshness
with (security_invoker = true) as
select
  c.etl_name,
  c.runtime,
  c.cron_expr,
  c.cadence_minutes,
  f.last_run,
  case
    when f.last_run is null then null
    else round(extract(epoch from now() - f.last_run) / 60)::integer
  end                                                as age_minutes,
  h.data ->> 'status'                                as last_status,
  case
    when c.cadence_minutes is null then false
    when f.last_run is null then true
    else now() - f.last_run > make_interval(mins => c.cadence_minutes * 2)
  end                                                as is_stale
from etl.expected_cadence c
left join lateral (
  select max(d.fetched_at) as last_run
  from public.data_cache d
  where d.cache_key = c.health_key
     or d.source = any (c.source_names)
) f on true
left join public.data_cache h on h.cache_key = c.health_key;

comment on view public.etl_freshness is
  'Frescor de cada pipeline: ultima gravacao, idade em minutos e se passou de 2x a cadencia esperada.';

create or replace view public.etl_stale
with (security_invoker = true) as
select *
from public.etl_freshness
where is_stale
order by age_minutes desc nulls first;

comment on view public.etl_stale is
  'Apenas os pipelines atrasados (idade > 2x a cadencia). Usar como alerta.';

revoke all on public.etl_freshness from anon, authenticated;
revoke all on public.etl_stale     from anon, authenticated;
grant select on public.etl_freshness to service_role;
grant select on public.etl_stale     to service_role;
