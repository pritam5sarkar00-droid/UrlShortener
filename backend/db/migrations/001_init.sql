-- Mounted into /docker-entrypoint-initdb.d, runs automatically on first
-- container start (only when the postgres_data volume is empty).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS urls (
  id BIGINT PRIMARY KEY,                 -- raw Snowflake ID
  short_code VARCHAR(20) UNIQUE NOT NULL,    -- Base62(id) for generated codes, or a custom alias
  long_url TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- nullable: anonymous links allowed
  is_custom_alias BOOLEAN DEFAULT false,
  click_count BIGINT DEFAULT 0,          -- denormalized counter, updated async by the worker
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,                -- defaults to created_at + 1 year, applied in app code
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);
CREATE INDEX IF NOT EXISTS idx_urls_expires_at ON urls(expires_at) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS click_events (
  id BIGINT PRIMARY KEY,
  short_code VARCHAR(20) NOT NULL,       -- logical reference only, no FK (see design notes)
  clicked_at TIMESTAMPTZ DEFAULT now(),
  ip_hash VARCHAR(64),
  user_agent TEXT,
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_click_events_short_code ON click_events(short_code);
