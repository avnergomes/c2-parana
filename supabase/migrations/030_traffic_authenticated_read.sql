-- Migration 030: garante leitura de aviation_traffic e maritime_traffic
-- por usuarios autenticados. A migration 029 criou policies apenas para
-- o role 'anon', causando array vazio quando supabase-js envia JWT
-- authenticated (todo usuario logado). Solucao: trocar 'TO anon' por
-- 'TO anon, authenticated' (ou usar role 'public'). Como CREATE POLICY
-- nao aceita ALTER de role list, precisamos DROP e recriar.

DROP POLICY IF EXISTS "anon_read_aviation_traffic" ON aviation_traffic;
DROP POLICY IF EXISTS "anon_read_maritime_traffic" ON maritime_traffic;

CREATE POLICY "public_read_aviation_traffic"
  ON aviation_traffic FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_maritime_traffic"
  ON maritime_traffic FOR SELECT TO anon, authenticated USING (true);
