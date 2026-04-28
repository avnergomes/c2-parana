-- Migration 032: schedule ETL clima via pg_cron (a cada 15min)
--
-- Move o cron clima do GH Actions (1h, jitter) para pg_cron Supabase
-- (15min, exato). Open-Meteo atualiza a cada hora, mas pollar mais
-- frequente captura mudancas mais rapido e mitiga falhas pontuais.

SELECT cron.schedule(
  'etl-clima-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fialxjcsgywvvuxjxcly.supabase.co/functions/v1/etl-clima',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpYWx4amNzZ3l3dnZ1eGp4Y2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjczNTMsImV4cCI6MjA4Nzk0MzM1M30.e3X-LSPVUbxl-P9KLB9TuGB0nkmZ4OrNyHL9SuxaRgM'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
