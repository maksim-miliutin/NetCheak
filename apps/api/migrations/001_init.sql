CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 443 CHECK (port BETWEEN 1 AND 65535),
    enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE (host, port)
);

CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    attempts INTEGER NOT NULL,
    timeout_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS target_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    sent INTEGER NOT NULL,
    received INTEGER NOT NULL,
    loss_percent REAL NOT NULL,
    minimum_ms REAL,
    average_ms REAL,
    maximum_ms REAL,
    median_ms REAL,
    jitter_ms REAL,
    quality TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS target_runs_target_idx ON target_runs (target_id, id DESC);

CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_run_id INTEGER NOT NULL REFERENCES target_runs(id) ON DELETE CASCADE,
    reachable INTEGER NOT NULL,
    latency_ms REAL,
    error TEXT
);

CREATE INDEX IF NOT EXISTS samples_run_idx ON samples (target_run_id);

INSERT OR IGNORE INTO targets (name, host, port) VALUES
    ('Cloudflare DNS', '1.1.1.1', 443),
    ('Google DNS', '8.8.8.8', 443),
    ('Wikipedia', 'wikipedia.org', 443),
    ('GitHub', 'github.com', 443);
