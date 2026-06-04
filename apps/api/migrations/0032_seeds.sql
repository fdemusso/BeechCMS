-- =============================================================================
-- Runtime Seeds — Seed definitions stored in D1 (source of truth at runtime)
--
-- `seeds`      : one row per content type. `definition` is the full Seed JSON.
-- `seed_meta`  : single-row table holding the registry version token used for
--                multi-isolate cache invalidation (see docs/Sprints/runtime-seeds).
-- =============================================================================

CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,                       -- JSON-serialized Seed
    status      TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime'
                        CHECK (source IN ('code', 'runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_seeds_status ON seeds(status);

CREATE TABLE IF NOT EXISTS seed_meta (
    id      TEXT NOT NULL PRIMARY KEY,
    value   TEXT NOT NULL
);

-- registry_version starts at 1; bumped on every seed write (sprint 03/04).
INSERT OR IGNORE INTO seed_meta (id, value) VALUES ('registry_version', '1');
