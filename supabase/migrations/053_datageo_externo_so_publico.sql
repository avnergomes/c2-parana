-- Migration 053: usuário externo do DataGeo lê só dado público.
--
-- O termo do externo (datageo-command, src/data/termoLgpd.js) diz que ele
-- acessa apenas dados públicos e que a obrigação é citar a fonte. A 051 já
-- nega o bucket datageo-privado; aqui o resto do que a 045 libera:
--
-- 1. data_cache: externo só lê as chaves que o DataGeo consome (todas de
--    fonte aberta). Fica de fora, por exemplo, getec_extensao_pr, que traz
--    nomes de extensionistas por município.
-- 2. Tabelas que o DataGeo não lê (regras, playbooks, ações e relatórios de
--    incidente, alertas brutos, SIH, legislativo): externo não lê.
-- 3. Escritas em incidentes: externo não escreve.
--
-- As demais tabelas da 045 (focos, clima, rios, Cemaden, IRTC, ar,
-- anomalias, notícias, tráfego aéreo e marítimo, dengue, incidentes e
-- boletins gerados de alertas públicos) seguem legíveis: fonte aberta, sem
-- dado pessoal.

create or replace function public.datageo_interno()
returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_datageo() and not public.is_datageo_externo()
$$;

-- 1. data_cache: chaves públicas que o DataGeo usa (datageoClient.js: dgCache).
drop policy if exists datageo_read on public.data_cache;
create policy datageo_read on public.data_cache
  for select to authenticated
  using (
    (select public.is_datageo())
    and (
      not (select public.is_datageo_externo())
      or cache_key in ('appa_lineup_pr', 'infohidro_estacoes_pr', 'meteo_grade_pr')
    )
  );

-- 2. Tabelas fora do DataGeo: só interno.
do $$
declare t text;
begin
  foreach t in array array[
    'alert_rules', 'alerts', 'datasus_sih', 'escalation_rules', 'incident_actions',
    'incident_reports', 'legislative_items', 'playbooks'
  ] loop
    execute format('drop policy if exists datageo_read on public.%I', t);
    execute format(
      'create policy datageo_read on public.%I for select to authenticated using ((select public.datageo_interno()))', t);
  end loop;
end $$;

-- 3. Escritas em incidentes (045): externo fora.
drop policy if exists incident_reports_auth_write on public.incident_reports;
create policy incident_reports_auth_write on public.incident_reports for all
  using (auth.role() = 'service_role' or (select public.datageo_interno()))
  with check (auth.role() = 'service_role' or (select public.datageo_interno()));
drop policy if exists incidents_auth_update on public.incidents;
create policy incidents_auth_update on public.incidents for update
  using (auth.role() = 'service_role' or (select public.datageo_interno()));
drop policy if exists incident_actions_service_write on public.incident_actions;
create policy incident_actions_service_write on public.incident_actions for insert
  with check (auth.role() = 'service_role' or (select public.datageo_interno()));
