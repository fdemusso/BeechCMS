CREATE TABLE IF NOT EXISTS automations (
  id                 TEXT    NOT NULL PRIMARY KEY,
  seed_slug          TEXT    NOT NULL,
  name               TEXT    NOT NULL,
  enabled            INTEGER NOT NULL DEFAULT 1,
  trigger_event      TEXT    NOT NULL CHECK(trigger_event IN ('create','update','delete','cron')),
  trigger_cron       TEXT,
  trigger_conditions TEXT,
  actions            TEXT    NOT NULL,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_automations_seed_slug ON automations(seed_slug);
CREATE INDEX IF NOT EXISTS idx_automations_enabled   ON automations(enabled);
