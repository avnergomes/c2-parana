-- Migration 029: Trafego aereo (OpenSky) + maritimo (AISStream).
--
-- Snapshot por minuto: PK natural (icao24/mmsi, observed_at). Indices em
-- (observed_at DESC) para janelas recentes e (lat, lon) para queries por
-- area. Sem PostGIS para manter compatibilidade com o restante do schema
-- (lat/lon DOUBLE PRECISION, igual fire_spots/river_levels).
--
-- Retencao: 7 dias. ETL faz purge a cada run (volume estimado: 30-50k
-- linhas/dia para aviacao, 20-40k/dia para maritimo).

CREATE TABLE IF NOT EXISTS aviation_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icao24 TEXT NOT NULL,                        -- hex code unico do transponder
  callsign TEXT,                               -- callsign IATA/ICAO (pode vir vazio)
  origin_country TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  baro_altitude_m DOUBLE PRECISION,            -- altitude barometrica em metros
  geo_altitude_m DOUBLE PRECISION,             -- altitude geometrica (GPS) em metros
  velocity_ms DOUBLE PRECISION,                -- velocidade ground em m/s
  true_track DOUBLE PRECISION,                 -- heading em graus (0-360)
  vertical_rate_ms DOUBLE PRECISION,           -- subida/descida em m/s
  on_ground BOOLEAN NOT NULL DEFAULT FALSE,
  squawk TEXT,                                 -- transponder code (4 digitos)
  category SMALLINT,                           -- ICAO category (1=light, 2=small, 3=large, etc)
  source TEXT NOT NULL DEFAULT 'opensky',
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(icao24, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_aviation_observed
  ON aviation_traffic(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_aviation_icao24
  ON aviation_traffic(icao24, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_aviation_geo
  ON aviation_traffic(latitude, longitude);

ALTER TABLE aviation_traffic ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_aviation_traffic"
  ON aviation_traffic FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_aviation_traffic"
  ON aviation_traffic FOR ALL TO service_role USING (true);


CREATE TABLE IF NOT EXISTS maritime_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmsi BIGINT NOT NULL,                        -- Maritime Mobile Service Identity (9 digitos)
  imo BIGINT,                                  -- IMO number (7 digitos, opcional)
  vessel_name TEXT,
  callsign TEXT,
  ship_type SMALLINT,                          -- AIS ship type (0-99)
  ship_type_label TEXT,                        -- ex: 'Cargo', 'Tanker', 'Passenger'
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  sog_knots DOUBLE PRECISION,                  -- speed over ground em nos
  cog_deg DOUBLE PRECISION,                    -- course over ground em graus
  heading_deg DOUBLE PRECISION,                -- heading da bussola
  nav_status SMALLINT,                         -- 0=under way, 1=at anchor, 5=moored, etc
  nav_status_label TEXT,
  destination TEXT,
  eta TEXT,                                    -- ETA bruto AIS (mm-dd hh:mm), nao DATE
  draught_m DOUBLE PRECISION,
  length_m INT,
  width_m INT,
  source TEXT NOT NULL DEFAULT 'aisstream',
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mmsi, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_maritime_observed
  ON maritime_traffic(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_maritime_mmsi
  ON maritime_traffic(mmsi, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_maritime_geo
  ON maritime_traffic(latitude, longitude);

ALTER TABLE maritime_traffic ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_maritime_traffic"
  ON maritime_traffic FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_maritime_traffic"
  ON maritime_traffic FOR ALL TO service_role USING (true);
