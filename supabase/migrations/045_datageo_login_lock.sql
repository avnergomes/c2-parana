-- Migration 045: leitura dos dados so para usuarios liberados (gate de login do DataGeo).
--
-- Substitui a leitura anon/publica da migration 008 por authenticated + flag
-- app_metadata.datageo = true. app_metadata so e gravavel pela service key, entao
-- quem se cadastra pelo /register do c2 nao ve dado ate ser liberado.
-- Escritas (service_role / ETL) nao mudam.
--
-- Liberar usuario: update auth.users set raw_app_meta_data = raw_app_meta_data || '{"datageo":true}' where email = '...';
-- O JWT so carrega a flag nova depois do proximo refresh de token (<= 1h) ou relogin.

do $$
declare
  t text;
  p record;
  tabelas text[] := array[
    'air_quality','alert_rules','alerts','anomalies','aviation_traffic','cemaden_alerts',
    'climate_data','data_cache','datasus_sih','dengue_data','dengue_projections',
    'escalation_rules','fire_spots','incident_actions','incident_reports','incidents',
    'irtc_scores','legislative_items','maritime_traffic','news_items','playbooks',
    'river_levels','situational_reports'
  ];
begin
  foreach t in array tabelas loop
    -- derruba toda policy de SELECT que libera leitura geral (anon/public/authenticated com "true")
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT' and qual = 'true'
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke select on public.%I from anon', t);
    execute format(
      'create policy datageo_read on public.%I for select to authenticated using ((select public.is_datageo()))', t);
  end loop;
end $$;

-- Escritas que aceitavam qualquer authenticated (a ALL de incident_reports tambem
-- dava SELECT): passam a exigir a flag. service_role segue liberado.
drop policy if exists incident_reports_auth_write on public.incident_reports;
create policy incident_reports_auth_write on public.incident_reports for all
  using (auth.role() = 'service_role' or (select public.is_datageo()))
  with check (auth.role() = 'service_role' or (select public.is_datageo()));

drop policy if exists incidents_auth_update on public.incidents;
create policy incidents_auth_update on public.incidents for update
  using (auth.role() = 'service_role' or (select public.is_datageo()));

drop policy if exists incident_actions_service_write on public.incident_actions;
create policy incident_actions_service_write on public.incident_actions for insert
  with check (auth.role() = 'service_role' or (select public.is_datageo()));

-- Trava: nenhuma policy das tabelas de dado pode sobrar liberando anon/public/authenticated sem a flag.
do $$
declare sobra text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into sobra
  from pg_policies
  where schemaname = 'public'
    and tablename in ('air_quality','alert_rules','alerts','anomalies','aviation_traffic','cemaden_alerts',
      'climate_data','data_cache','datasus_sih','dengue_data','dengue_projections','escalation_rules',
      'fire_spots','incident_actions','incident_reports','incidents','irtc_scores','legislative_items',
      'maritime_traffic','news_items','playbooks','river_levels','situational_reports')
    and roles && array['anon','public','authenticated']::name[]
    and coalesce(qual, '') || coalesce(with_check, '') not like '%is_datageo%'
    and coalesce(qual, with_check) <> '(auth.role() = ''service_role''::text)';
  if sobra is not null then
    raise exception 'policies ainda abertas sem is_datageo: %', sobra;
  end if;
end $$;

-- Vazamento pre-existente: a view rodava como owner (bypass de RLS) e era legivel pelo anon,
-- expondo subscriptions (ids Stripe) de todos os usuarios. Com security_invoker vale a RLS "select own".
alter view public.user_access set (security_invoker = true);
revoke select on public.user_access from anon;
