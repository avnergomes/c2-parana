-- Migration 049: correções do log de acesso do DataGeo (048).
--
-- 1. datageo_acesso_resumo: a variável `ini` colidia com a coluna `ini` da CTE
--    de sessões (42702 em toda chamada). Variáveis agora com prefixo v_.
-- 2. Identidade na trilha: raw_user_meta_data é editável pelo próprio usuário
--    (PUT /auth/v1/user). A matrícula passa a vir do e-mail do login
--    (<matricula>@sisater.local) e as RPCs devolvem também o e-mail; o nome de
--    user_metadata é só rótulo (o painel prefere o nome do SisPont).
-- 3. Retenção semanal: primeira semana calculada sobre o log inteiro e sem a
--    semana corrente (incompleta).
-- 4. Limite de volume: no máximo 300 eventos por usuário por minuto (o front
--    manda ~20 a cada 15 s); acima disso o INSERT inteiro é recusado.

create or replace function public.datageo_matricula(u auth.users)
returns text
language sql stable
set search_path = ''
as $$
  select case when u.email like '%@sisater.local' then split_part(u.email, '@', 1)
              else u.raw_user_meta_data ->> 'matricula' end
$$;

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
           u.last_sign_in_at
    from auth.users u
    where coalesce((u.raw_app_meta_data ->> 'datageo')::boolean, false)
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
      'liberados', (select count(*) from usr),
      'nunca_entraram', (select count(*) from usr where last_sign_in_at is null),
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

-- Mesmo contrato da 048 + coluna email (muda o tipo de retorno: drop antes).
drop function if exists public.datageo_acesso_eventos(timestamptz, timestamptz, uuid, text, text, integer, integer);
create function public.datageo_acesso_eventos(
  p_ini    timestamptz default now() - interval '7 days',
  p_fim    timestamptz default now(),
  p_user   uuid default null,
  p_evento text default null,
  p_busca  text default null,
  p_limite integer default 100,
  p_offset integer default 0
)
returns table (
  id bigint, criado_em timestamptz, user_id uuid, email text, nome text, matricula text,
  sessao_id uuid, evento text, alvo text, detalhe jsonb, total bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_datageo_admin() then
    raise exception 'acesso restrito ao administrador do DataGeo' using errcode = '42501';
  end if;
  return query
    select l.id, l.criado_em, l.user_id, u.email::text,
           u.raw_user_meta_data ->> 'nome', public.datageo_matricula(u),
           l.sessao_id, l.evento, l.alvo, l.detalhe,
           count(*) over ()
    from public.datageo_acesso_log l
    left join auth.users u on u.id = l.user_id
    where l.criado_em >= coalesce(p_ini, now() - interval '7 days')
      and l.criado_em <  coalesce(p_fim, now())
      and (p_user is null or l.user_id = p_user)
      and (p_evento is null or l.evento = p_evento)
      and (nullif(trim(p_busca), '') is null or strpos(lower(concat_ws(' ',
            l.alvo, l.detalhe::text, u.email, u.raw_user_meta_data ->> 'nome', public.datageo_matricula(u))),
            lower(trim(p_busca))) > 0)
    order by l.criado_em desc, l.id desc
    limit least(greatest(coalesce(p_limite, 100), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.datageo_matricula(auth.users) from public, anon, authenticated;
revoke all on function public.datageo_acesso_eventos(timestamptz, timestamptz, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.datageo_acesso_eventos(timestamptz, timestamptz, uuid, text, text, integer, integer) to authenticated;

-- Limite de volume por usuário (statement-level: um teste por POST em lote).
create or replace function public.datageo_acesso_log_limite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.datageo_acesso_log
      where user_id = (select auth.uid()) and criado_em > now() - interval '1 minute') > 300 then
    raise exception 'limite de eventos de acesso excedido' using errcode = '54000';
  end if;
  return null;
end;
$$;

drop trigger if exists datageo_acesso_log_limite on public.datageo_acesso_log;
create trigger datageo_acesso_log_limite
  after insert on public.datageo_acesso_log
  for each statement execute function public.datageo_acesso_log_limite();
