-- Migration 051: usuário externo do DataGeo.
--
-- app_metadata.datageo_externo = true (só a service key / Edge Function
-- datageo-usuarios grava): continua lendo as tabelas liberadas pela 045
-- (is_datageo), mas NÃO lê o bucket datageo-privado (camadas e arquivos
-- não-abertos: CAF, CadÚnico, ADAPAR, servidores, programas IDR...).
-- O resumo do painel de acessos passa a trazer o campo `externo`.

create or replace function public.is_datageo_externo()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'datageo_externo')::boolean, false)
$$;

drop policy if exists datageo_privado_read on storage.objects;
create policy datageo_privado_read on storage.objects
  for select to authenticated
  using (bucket_id = 'datageo-privado' and (select public.is_datageo()) and not (select public.is_datageo_externo()));

create or replace function public.datageo_acesso_resumo(p_dias integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_tz   constant text := 'America/Sao_Paulo';
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 366);
  v_ini  timestamptz := now() - make_interval(days => v_dias);
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_semana date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  if not public.is_datageo_admin() then
    raise exception 'acesso restrito ao administrador do DataGeo' using errcode = '42501';
  end if;

  with ev as (
    select * from public.datageo_acesso_log where criado_em >= v_ini
  ), acoes as (
    select * from ev where evento <> 'heartbeat'
  ), ses as (
    select sessao_id, user_id, min(criado_em) as s_ini, max(criado_em) as s_fim
    from ev group by sessao_id, user_id
  ), usr as (
    select u.id, u.email, u.raw_user_meta_data ->> 'nome' as nome, public.datageo_matricula(u) as matricula,
           u.last_sign_in_at,
           coalesce((u.raw_app_meta_data ->> 'datageo')::boolean, false) as ativo,
           u.raw_app_meta_data ->> 'revogado_em' as revogado_em,
           coalesce((u.raw_app_meta_data ->> 'datageo_externo')::boolean, false) as externo
    from auth.users u
    where u.raw_app_meta_data ? 'datageo'  -- liberados e revogados; c2 sem a chave fica fora
  ), ultimo as (
    select user_id, max(criado_em) as ultimo_evento from public.datageo_acesso_log group by user_id
  ), top_camadas as (
    select user_id, jsonb_agg(alvo order by n desc) as camadas
    from (
      select user_id, alvo, count(*) as n,
             row_number() over (partition by user_id order by count(*) desc) as rk
      from acoes where evento = 'camada_on' group by user_id, alvo
    ) t where rk <= 3 group by user_id
  ), por_usuario as (
    select user_id, count(*) as acoes,
           count(distinct (criado_em at time zone v_tz)::date) as dias_ativos
    from acoes group by user_id
  ), ses_usuario as (
    select user_id, count(*) as sessoes, sum(extract(epoch from s_fim - s_ini)) / 60 as minutos
    from ses group by user_id
  ), primeira as (
    select user_id, date_trunc('week', min(criado_em) at time zone v_tz)::date as semana
    from public.datageo_acesso_log group by user_id
  ), semanas as (
    select distinct user_id, date_trunc('week', criado_em at time zone v_tz)::date as semana
    from public.datageo_acesso_log
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'periodo_dias', v_dias,
    'kpis', jsonb_build_object(
      'dau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= v_hoje),
      'wau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= now() - interval '30 days'),
      'usuarios_periodo', (select count(distinct user_id) from ev),
      'sessoes', (select count(*) from ses),
      'mediana_sessao_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from s_fim - s_ini) / 60))::numeric, 1) from ses),
      'liberados', (select count(*) from usr where ativo),
      'revogados', (select count(*) from usr where not ativo),
      'externos', (select count(*) from usr where ativo and externo),
      'nunca_entraram', (select count(*) from usr where ativo and last_sign_in_at is null),
      'eventos_sensiveis', (select count(*) from acoes where evento in ('busca_pessoa', 'registro_aberto', 'exportacao'))
    ),
    'diario', (select coalesce(jsonb_agg(d order by d.dia), '[]') from (
      select (criado_em at time zone v_tz)::date as dia, count(distinct user_id) as usuarios,
             count(distinct sessao_id) as sessoes, count(*) filter (where evento <> 'heartbeat') as acoes
      from ev group by 1) d),
    'eventos', (select coalesce(jsonb_agg(e order by e.n desc), '[]') from (
      select evento, count(*) as n, count(distinct user_id) as usuarios from acoes group by evento) e),
    'camadas', (select coalesce(jsonb_agg(c order by c.acessos desc), '[]') from (
      select alvo as camada, count(*) as acessos, count(distinct user_id) as usuarios
      from acoes where evento = 'camada_on' group by alvo order by 2 desc limit 20) c),
    'municipios', (select coalesce(jsonb_agg(m order by m.acessos desc), '[]') from (
      select alvo as ibge, max(detalhe ->> 'nome') as nome, count(*) as acessos, count(distinct user_id) as usuarios
      from acoes where evento = 'ficha_municipio' group by alvo order by 3 desc limit 20) m),
    'heatmap', (select coalesce(jsonb_agg(h), '[]') from (
      select extract(isodow from criado_em at time zone v_tz)::int as dow,
             extract(hour from criado_em at time zone v_tz)::int as hora,
             count(distinct sessao_id) as sessoes
      from ev group by 1, 2) h),
    'retencao', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (
      select p.semana, count(*) as novos,
             count(*) filter (where exists (
               select 1 from semanas s where s.user_id = p.user_id and s.semana = p.semana + 7)) as voltaram
      from primeira p
      where p.semana >= v_ini::date - 6 and p.semana < v_semana
      group by p.semana) x),
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'nome', u.nome, 'matricula', u.matricula,
        'ativo', u.ativo, 'revogado_em', u.revogado_em, 'externo', u.externo,
        'ultimo_login', u.last_sign_in_at, 'ultimo_evento', ul.ultimo_evento,
        'sessoes', coalesce(su.sessoes, 0), 'minutos', round(coalesce(su.minutos, 0)::numeric, 1),
        'acoes', coalesce(pu.acoes, 0), 'dias_ativos', coalesce(pu.dias_ativos, 0),
        'camadas', coalesce(tc.camadas, '[]')
      ) order by coalesce(pu.acoes, 0) desc, u.nome), '[]')
      from usr u
      left join ultimo ul on ul.user_id = u.id
      left join ses_usuario su on su.user_id = u.id
      left join por_usuario pu on pu.user_id = u.id
      left join top_camadas tc on tc.user_id = u.id)
  ) into r;
  return r;
end;
$$;
