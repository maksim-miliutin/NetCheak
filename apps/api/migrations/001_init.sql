CREATE TABLE IF NOT EXISTS targets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 443 CHECK (port BETWEEN 1 AND 65535),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (host, port)
);

CREATE TABLE IF NOT EXISTS checks (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL,
    timeout_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS checks_started_idx ON checks (started_at DESC);

CREATE TABLE IF NOT EXISTS target_runs (
    id SERIAL PRIMARY KEY,
    check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    sent INTEGER NOT NULL,
    received INTEGER NOT NULL,
    loss_percent DOUBLE PRECISION NOT NULL,
    minimum_ms DOUBLE PRECISION,
    average_ms DOUBLE PRECISION,
    maximum_ms DOUBLE PRECISION,
    median_ms DOUBLE PRECISION,
    jitter_ms DOUBLE PRECISION,
    quality TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS target_runs_target_idx ON target_runs (target_id, id DESC);

CREATE TABLE IF NOT EXISTS samples (
    id SERIAL PRIMARY KEY,
    target_run_id INTEGER NOT NULL REFERENCES target_runs(id) ON DELETE CASCADE,
    reachable BOOLEAN NOT NULL,
    latency_ms DOUBLE PRECISION,
    error TEXT
);

CREATE INDEX IF NOT EXISTS samples_run_idx ON samples (target_run_id);

INSERT INTO targets (name, host, port) VALUES
    ('Cloudflare DNS', '1.1.1.1', 443),
    ('Google DNS', '8.8.8.8', 443),
    ('Yandex', 'ya.ru', 443),
    ('GitHub', 'github.com', 443)
ON CONFLICT (host, port) DO NOTHING;