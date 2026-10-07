-- 047: termo de responsabilidade LGPD do DataGeo (dgp-comando).
--
-- No login, cada usuario assina o termo informando CPF e e-mail; o front grava
-- um JSON em datageo-termos/<auth.uid()>/<versao>_<instante>.json. A prova de
-- data e hora e o storage.objects.created_at (hora do servidor).
--
-- Bucket proprio, nao o datageo-privado: aquele e legivel por todo usuario
-- DataGeo (044), e CPF de um nao pode ser lido pelos outros. Aqui o usuario so
-- INSERE na propria pasta: sem SELECT, UPDATE ou DELETE (nao le, nao apaga,
-- nao sobrescreve). A consulta dos termos e pela service key (bypassa RLS).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('datageo-termos', 'datageo-termos', false, 65536, array['application/json'])
on conflict (id) do nothing;

drop policy if exists datageo_termos_insert on storage.objects;
create policy datageo_termos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'datageo-termos'
    and (select public.is_datageo())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
