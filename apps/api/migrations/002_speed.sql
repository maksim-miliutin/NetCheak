CREATE TABLE IF NOT EXISTS speed_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL,
    download_mbps REAL,
    upload_mbps REAL,
    download_bytes INTEGER,
    upload_bytes INTEGER,
    streams INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS speed_runs_measured_idx ON speed_runs (measured_at DESC, id DESC);
