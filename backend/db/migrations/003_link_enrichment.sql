-- Adds link enrichment columns. Run against BOTH local Postgres and Neon,
-- same as 002_google_auth.sql - neither auto-runs against an already-existing
-- database.

ALTER TABLE urls ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE urls ADD COLUMN IF NOT EXISTS category VARCHAR(50);
