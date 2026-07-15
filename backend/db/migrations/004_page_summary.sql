-- Adds AI page-summary columns. Run against BOTH local Postgres and Neon,
-- same as the previous two migrations.

ALTER TABLE urls ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE urls ADD COLUMN IF NOT EXISTS key_topics TEXT[];
ALTER TABLE urls ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER;
