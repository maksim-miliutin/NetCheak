-- What got a site through, found by trying rather than by reading somebody's config.
-- Kept per host because it differs per host: the same machine needed one thing for a
-- call and nothing at all for most of what it opens. Nothing about a visit is here,
-- only a name that was searched for and the settings that answered.
CREATE TABLE IF NOT EXISTS driver_found (
    host TEXT PRIMARY KEY,
    fooling TEXT NOT NULL,
    ttl INTEGER NOT NULL,
    repeats INTEGER NOT NULL,
    found_at TEXT NOT NULL DEFAULT (datetime('now'))
);
