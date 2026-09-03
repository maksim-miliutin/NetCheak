-- The seeded list had a Russian site among the four, which is the wrong side of the
-- question this tool asks: what is worth watching here is what a filter might object
-- to, and a site nobody objects to measures the line and nothing else.
--
-- Only the seeded row goes, and only if nothing has been measured against it. A name
-- somebody typed themselves is theirs, and a target with history behind it is worth
-- more than tidiness.
DELETE FROM targets
WHERE host = 'ya.ru'
  AND name = 'Yandex'
  AND id NOT IN (SELECT DISTINCT target_id FROM target_runs);

INSERT OR IGNORE INTO targets (name, host, port) VALUES
    ('Wikipedia', 'wikipedia.org', 443);
