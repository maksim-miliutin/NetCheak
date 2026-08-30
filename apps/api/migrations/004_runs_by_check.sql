-- Sweeping old samples read the whole runs table to find which runs belonged to an
-- old check: the only index on runs is by target, and this asks by check. The cascade
-- when a check is deleted looked for its children the same way.
CREATE INDEX IF NOT EXISTS target_runs_check_idx ON target_runs (check_id);
