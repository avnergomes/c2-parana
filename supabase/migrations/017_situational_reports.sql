-- Migration 017: Situational reports (Fase 3.B)
--
-- Daily auto-generated intelligence reports consolidating all domain
-- indicators, IRTC top risks, and actionable recommendations.

CREATE TABLE IF NOT EXISTS situational_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  executive_summary TEXT NOT NULL,
  active_alerts_count INT NOT NULL DEFAULT 0,
  top_risks JSONB NOT NULL DEFAULT '[]',
  domain_summaries JSONB NOT NULL DEFAULT '{}',
  recommendations TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE situational_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "situational_reports_read" ON situational_reports FOR SELECT USING (true);
CREATE POLICY "situational_reports_service_write" ON situational_reports FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_situational_reports_date ON situational_reports(report_date DESC);
