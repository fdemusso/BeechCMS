-- 0031_import_jobs_seed.sql
-- Bootstraps the `import_jobs` system content type (Bulk Data Transfer, sprint 3/4).
-- The table DDL is the verbatim output of planCreateSeed() for the definition inserted below:
-- the Botanical Engine, not this file, is the authority on the schema.

CREATE TABLE IF NOT EXISTS content_import_jobs (
  id         TEXT    NOT NULL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  target_seed  TEXT NOT NULL,
  format  TEXT NOT NULL,
  object_key  TEXT NOT NULL,
  job_state  TEXT NOT NULL,
  row_offset  REAL NOT NULL,
  inserted_rows  REAL NOT NULL,
  failed_rows  REAL NOT NULL,
  error_report  TEXT,
  created_by  TEXT NOT NULL,
  finished_at  INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON content_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON content_import_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_target_seed ON content_import_jobs(target_seed);
CREATE INDEX IF NOT EXISTS idx_import_jobs_job_state ON content_import_jobs(job_state);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON content_import_jobs(created_by);

-- INSERT OR IGNORE, not the repository's UPSERT: a migration runs once, and if an operator
-- already created a runtime seed on this slug we must not clobber their definition silently.
INSERT OR IGNORE INTO seeds (slug, definition, status, source, created_at, updated_at)
VALUES (
  'import_jobs',
  '{"slug":"import_jobs","label":"Import Job","labelPlural":"Import Jobs","displayNameAlias":"target_seed","dashboard":{"hidden":true},"branches":[{"id":"br_01","alias":"target_seed","label":"Target seed","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_02","alias":"format","label":"Format","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":false}},{"id":"br_03","alias":"object_key","label":"Object key","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":false}},{"id":"br_04","alias":"job_state","label":"State","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_05","alias":"row_offset","label":"Rows read","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_06","alias":"inserted_rows","label":"Rows inserted","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_07","alias":"failed_rows","label":"Rows failed","type":"number","requiredOnCreate":true,"policies":{"filter":false}},{"id":"br_08","alias":"error_report","label":"Error report","type":"json","policies":{"search":false,"filter":false,"sort":false}},{"id":"br_09","alias":"created_by","label":"Created by","type":"text","requiredOnCreate":true,"policies":{"search":false,"filter":true}},{"id":"br_10","alias":"finished_at","label":"Finished at","type":"date","policies":{"filter":false}}]}',
  'active',
  'code',
  unixepoch(),
  unixepoch()
);

-- seed-registry-cache.ts serves a cached SeedRegistry keyed on this token. Without the bump a
-- warm isolate would 404 on `import_jobs` for up to its 5s TTL after deploy.
UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version';
