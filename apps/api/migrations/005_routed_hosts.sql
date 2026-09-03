-- The map of "this host needed that way of writing" lived in memory only, so the
-- routing file started empty on every launch and the first visit to a blocked site
-- went the plain way again. Nothing about a visit is kept here: only a name a person
-- typed, or one the evasion check already found a way for, and the way that worked.
CREATE TABLE IF NOT EXISTS routed_hosts (
    host TEXT PRIMARY KEY,
    way TEXT NOT NULL,
    by_hand INTEGER NOT NULL DEFAULT 0,
    noted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
