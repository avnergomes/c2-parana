-- Migration 052: solicitações de acesso de usuários EXTERNOS ao DataGeo
-- (botão "Solicitar acesso" no gate de login do datageo-command).
--
-- Servidores do IDR não pedem: entram com matrícula e senha provisória.
-- Quem pede ainda não tem conta: INSERT anônimo, só nas colunas do
-- formulário (status, datas e decisão vêm do servidor). Ninguém lê pela
-- API: o admin lista, aprova e recusa pela Edge Function datageo-usuarios
-- (service key). Aprovado vira usuário externo (migration 051: sem o
-- bucket privado).
--
-- LGPD: dados coletados só para analisar o pedido (aceite obrigatório no
-- formulário); recusadas são apagadas após 90 dias.

create table if not exists public.datageo_solicitacao (
  id           bigint generated always as identity primary key,
  entidade     text not null check (char_length(entidade) between 2 and 160),
  nome         text not null check (char_length(nome) between 3 and 120),
  endereco     text not null check (char_length(endereco) between 5 and 300),
  cpf          text not null check (cpf ~ '^\d{11}$'),
  telefone     text not null check (telefone ~ '^\d{10,11}$'),
  email        text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 160),
  finalidade   text not null check (char_length(finalidade) between 10 and 1000),
  aceite_lgpd  boolean not null check (aceite_lgpd),
  status       text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  criado_em    timestamptz not null default now(),
  decidido_em  timestamptz,
  decidido_por uuid,
  user_id      uuid
);

-- Uma solicitação pendente por e-mail (reenvio dá 409 no PostgREST).
create unique index if not exists datageo_solicitacao_pendente_email
  on public.datageo_solicitacao (lower(email)) where status = 'pendente';
create index if not exists datageo_solicitacao_status on public.datageo_solicitacao (status, criado_em desc);

alter table public.datageo_solicitacao enable row level security;
revoke all on public.datageo_solicitacao from anon, authenticated;
grant insert (entidade, nome, endereco, cpf, telefone, email, finalidade, aceite_lgpd)
  on public.datageo_solicitacao to anon, authenticated;

drop policy if exists datageo_solicitacao_insert on public.datageo_solicitacao;
create policy datageo_solicitacao_insert on public.datageo_solicitacao
  for insert to anon, authenticated
  with check (status = 'pendente');

-- Teto global contra spam: no máximo 30 pedidos por hora (o formulário é público).
create or replace function public.datageo_solicitacao_limite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.datageo_solicitacao where criado_em > now() - interval '1 hour') > 30 then
    raise exception 'muitas solicitações; tente mais tarde' using errcode = '54000';
  end if;
  return null;
end;
$$;

drop trigger if exists datageo_solicitacao_limite on public.datageo_solicitacao;
create trigger datageo_solicitacao_limite
  after insert on public.datageo_solicitacao
  for each statement execute function public.datageo_solicitacao_limite();

-- Recusadas: apagadas 90 dias depois da decisão.
select cron.unschedule(jobname) from cron.job where jobname = 'datageo-solicitacao-retencao';
select cron.schedule(
  'datageo-solicitacao-retencao',
  '27 3 * * *',
  $$delete from public.datageo_solicitacao where status = 'recusada' and decidido_em < now() - interval '90 days'$$
);
