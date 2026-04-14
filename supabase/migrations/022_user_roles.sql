-- Migration 022: Roles de usuario (Fase 4.A)
--
-- Tres niveis: viewer (leitura), operator (gestao de incidentes),
-- commander (aprovacao, fechamento, audit completo).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('viewer', 'operator', 'commander'));

-- Atualiza trigger de criacao de usuario para incluir role default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'viewer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
