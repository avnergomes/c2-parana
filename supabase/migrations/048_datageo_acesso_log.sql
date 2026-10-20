-- Migration 048: log de acesso do DataGeo (analytics de uso + trilha de auditoria).
--
-- Uma linha por evento do front (src/data/acessoLog.js do datageo-command):
-- sessão, camada ligada/desligada, ficha, busca de pessoa (termo em claro),
-- registro aberto, exportação, heartbeat de 5 min. Finalidade: segurança e
-- auditoria do acesso a dados pessoais (LGPD art. 37/46), informada no termo.
--
-- Usuário DataGeo só INSERE a própria linha; user_id e criado_em vêm do
-- servidor (sem grant de insert nessas colunas). Ninguém lê a tabela pelo
-- PostgREST: o painel do admin (app_metadata.datageo_admin) usa as duas RPCs
-- security definer abaixo, que juntam nome e matrícula de auth.users.
-- Retenção: 12 meses (pg_cron diário).

create or replace function public.is_datageo_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'datageo_admin')::boolean, false)
$$;

create table if not exists public.datageo_acesso_log (
  id        bigint generated always as identity primary key,
  user_id   uuid not null default auth.uid(),
  sessao_id uuid not null,
  evento    text not null check (evento ~ '^[a-z_]{2,40}$'),
  alvo      text check (char_length(alvo) <= 300),
  detalhe   jsonb check (detalhe is null or pg_column_size(detalhe) <= 4096),
  criado_em timestamptz not null default now()
);

create index if not exists datageo_acesso_log_criado_em on public.datageo_acesso_log (criado_em);
create index if not exists datageo_acesso_log_user on public.datageo_acesso_log (user_id, criado_em);
create index if not exists datageo_acesso_log_evento on public.datageo_acesso_log (evento, criado_em);

alter table public.datageo_acesso_log enable row level security;
revoke all on public.datageo_acesso_log from anon, authenticated;
grant insert (sessao_id, evento, alvo, detalhe) on public.datageo_acesso_log to authenticated;

drop policy if exists datageo_acesso_log_insert on public.datageo_acesso_log;
create policy datageo_acesso_log_insert on public.datageo_acesso_log
  for insert to authenticated
  with check ((select public.is_datageo()) and user_id = (select auth.uid()));

-- Indicadores do painel. Dias, horas e semanas no fuso de Brasília.
create or replace function public.datageo_acesso_resumo(p_dias integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  tz  constant text := 'America/Sao_Paulo';
  dias integer := least(greatest(coalesce(p_dias, 30), 1), 366);
  ini timestamptz := now() - make_interval(days => dias);
  hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  r jsonb;
begin
  if not public.is_datageo_admin() then
    raise exception 'acesso restrito ao administrador do DataGeo' using errcode = '42501';
  end if;

  with ev as (
    select * from public.datageo_acesso_log where criado_em >= ini
  ), acoes as (
    select * from ev where evento <> 'heartbeat'
  ), ses as (
    select sessao_id, user_id, min(criado_em) as ini, max(criado_em) as fim
    from ev group by sessao_id, user_id
  ), usr as (
    select u.id, u.raw_user_meta_data ->> 'nome' as nome, u.raw_user_meta_data ->> 'matricula' as matricula,
           u.last_sign_in_at, u.created_at
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
           count(distinct (criado_em at time zone tz)::date) as dias_ativos
    from acoes group by user_id
  ), ses_usuario as (
    select user_id, count(*) as sessoes, sum(extract(epoch from fim - ini)) / 60 as minutos
    from ses group by user_id
  ), primeira as (
    select user_id, date_trunc('week', min(criado_em) at time zone tz)::date as semana
    from ev group by user_id
  ), semanas as (
    select distinct user_id, date_trunc('week', criado_em at time zone tz)::date as semana from ev
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'periodo_dias', dias,
    'kpis', jsonb_build_object(
      'dau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= hoje),
      'wau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from public.datageo_acesso_log where criado_em >= now() - interval '30 days'),
      'usuarios_periodo', (select count(distinct user_id) from ev),
      'sessoes', (select count(*) from ses),
      'mediana_sessao_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from fim - ini) / 60))::numeric, 1) from ses),
      'liberados', (select count(*) from usr),
      'nunca_entraram', (select count(*) from usr where last_sign_in_at is null),
      'eventos_sensiveis', (select count(*) from acoes where evento in ('busca_pessoa', 'registro_aberto', 'exportacao'))
    ),
    'diario', (select coalesce(jsonb_agg(d order by d.dia), '[]') from (
      select (criado_em at time zone tz)::date as dia, count(distinct user_id) as usuarios,
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
      select extract(isodow from criado_em at time zone tz)::int as dow,
             extract(hour from criado_em at time zone tz)::int as hora,
             count(distinct sessao_id) as sessoes
      from ev group by 1, 2) h),
    'retencao', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (
      select p.semana, count(*) as novos,
             count(*) filter (where exists (
               select 1 from semanas s where s.user_id = p.user_id and s.semana = p.semana + 7)) as voltaram
      from primeira p group by p.semana) x),
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'nome', u.nome, 'matricula', u.matricula,
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

-- Log completo, paginado e filtrável. p_busca procura (sem curinga) em alvo,
-- detalhe, nome e matrícula. Teto de 5000 linhas por chamada (export CSV).
create or replace function public.datageo_acesso_eventos(
  p_ini    timestamptz default now() - interval '7 days',
  p_fim    timestamptz default now(),
  p_user   uuid default null,
  p_evento text default null,
  p_busca  text default null,
  p_limite integer default 100,
  p_offset integer default 0
)
returns table (
  id bigint, criado_em timestamptz, user_id uuid, nome text, matricula text,
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
    select l.id, l.criado_em, l.user_id,
           u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'matricula',
           l.sessao_id, l.evento, l.alvo, l.detalhe,
           count(*) over ()
    from public.datageo_acesso_log l
    left join auth.users u on u.id = l.user_id
    where l.criado_em >= coalesce(p_ini, now() - interval '7 days')
      and l.criado_em <  coalesce(p_fim, now())
      and (p_user is null or l.user_id = p_user)
      and (p_evento is null or l.evento = p_evento)
      and (nullif(trim(p_busca), '') is null or strpos(lower(concat_ws(' ',
            l.alvo, l.detalhe::text, u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'matricula')),
            lower(trim(p_busca))) > 0)
    order by l.criado_em desc, l.id desc
    limit least(greatest(coalesce(p_limite, 100), 1), 5000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.datageo_acesso_resumo(integer) from public, anon;
revoke all on function public.datageo_acesso_eventos(timestamptz, timestamptz, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.datageo_acesso_resumo(integer) to authenticated;
grant execute on function public.datageo_acesso_eventos(timestamptz, timestamptz, uuid, text, text, integer, integer) to authenticated;

-- Retenção de 12 meses. Idempotente: unschedule antes de schedule.
select cron.unschedule(jobname) from cron.job where jobname = 'datageo-acesso-log-retencao';
select cron.schedule(
  'datageo-acesso-log-retencao',
  '17 3 * * *',
  $$delete from public.datageo_acesso_log where criado_em < now() - interval '12 months'$$
);
