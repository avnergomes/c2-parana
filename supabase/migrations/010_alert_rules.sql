-- Migration 010: Alert rules, notifications, preferences, webhooks
-- Fase 2 — Sistema de Alertas e Comunicações

-- Tabela de regras de alerta configuráveis
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL CHECK (domain IN ('clima', 'saude', 'ambiente', 'hidro', 'ar', 'composto')),
  condition JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  channels TEXT[] NOT NULL DEFAULT '{push}',
  cooldown_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de notificações disparadas
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id),
  user_id UUID REFERENCES auth.users(id),
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Tabela de preferências de notificação por usuário
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  telegram_enabled BOOLEAN DEFAULT false,
  telegram_chat_id TEXT,
  email_digest TEXT DEFAULT 'daily' CHECK (email_digest IN ('realtime', 'daily', 'weekly', 'off')),
  min_severity TEXT DEFAULT 'medium' CHECK (min_severity IN ('critical', 'high', 'medium', 'low')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de webhook subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{alert.fired}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "alert_rules_read" ON alert_rules FOR SELECT USING (true);
CREATE POLICY "alert_rules_service_write" ON alert_rules FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "notifications_own" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_service_write" ON notifications FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "prefs_own" ON notification_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "webhooks_own" ON webhook_subscriptions FOR ALL USING (auth.uid() = created_by);

-- Indexes
CREATE INDEX idx_notifications_user ON notifications(user_id, sent_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX idx_alert_rules_active ON alert_rules(domain) WHERE is_active = true;
