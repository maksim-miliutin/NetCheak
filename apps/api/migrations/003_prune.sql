-- Sweeping old rows means finding them by date, and there was no way to do that
-- without reading every check.
CREATE INDEX IF NOT EXISTS checks_started_idx ON checks (started_at);
