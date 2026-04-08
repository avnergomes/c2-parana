-- Migration 013: Habilitar Supabase Realtime para notifications e news_items
-- Fase 2.A — reduz latencia de alertas de 60s (polling) para <1s (websocket)
--
-- Realtime no Supabase e uma publication Postgres chamada supabase_realtime.
-- Adicionar uma tabela a essa publication faz com que INSERT/UPDATE/DELETE
-- sejam emitidos via websocket para clientes inscritos.
--
-- Idempotente: usa DO blocks para nao falhar se a tabela ja estiver na publication.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.news_items;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
