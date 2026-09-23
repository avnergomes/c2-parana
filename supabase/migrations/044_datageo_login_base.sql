-- Migration 044: base do gate de login do DataGeo (nao muda acesso de ninguem ainda).
-- is_datageo(): flag app_metadata.datageo no JWT (so a service key grava app_metadata).
-- Bucket privado para os estaticos nao-abertos (agroindustrias IDR, estradas SEAB, radios).

create or replace function public.is_datageo()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'datageo')::boolean, false)
$$;

-- Arquivos estaticos nao-abertos do DataGeo (agroindustrias IDR, estradas SEAB, radios).
insert into storage.buckets (id, name, public)
values ('datageo-privado', 'datageo-privado', false)
on conflict (id) do update set public = false;

drop policy if exists datageo_privado_read on storage.objects;
create policy datageo_privado_read on storage.objects
  for select to authenticated
  using (bucket_id = 'datageo-privado' and (select public.is_datageo()));
