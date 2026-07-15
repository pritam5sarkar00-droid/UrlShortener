-- Adds Google OAuth support.
-- Run this against BOTH your local Postgres and your Neon database - it
-- does not run automatically like 001_init.sql did (that one only auto-runs
-- on a fresh docker-compose volume; Neon was seeded manually, and any
-- already-running local Postgres needs this applied by hand too).

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
