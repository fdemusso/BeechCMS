-- =============================================================================
-- SEED VIEWS — shared, ordered, named view instances per content type
--
--     One row per instance (Table / Gallery / Kanban today). Config is a JSON
--     ContentViewConfig whose column references are Branch IDs (br_XX) or engine
--     system columns, never aliases (validated in @beechcms/core).
--
--     No CHECK on view_type: the set of view types grows with the View Harness
--     and an SQLite CHECK change requires a table rebuild. The type is validated
--     in core on write (zod enum) and on read (isViewAuthorized).
--
--     Named seed_views, not content_views: content_{slug} is the namespace of
--     seed-owned tables, and a seed slugged "views" would own content_views.
--
--     Rows are never cascaded from seeds (parity with seed_layouts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS seed_views (
    id          TEXT    NOT NULL PRIMARY KEY,           -- IIdGenerator.uuid()
    seed_slug   TEXT    NOT NULL,                       -- seeds.slug
    view_type   TEXT    NOT NULL,                       -- 'table' | 'gallery' | 'kanban'
    title       TEXT,                                   -- NULL = translated type label
    position    INTEGER NOT NULL,                       -- tab order within seed_slug, ascending
    config      TEXT    NOT NULL DEFAULT '{}',          -- JSON ContentViewConfig
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_by  TEXT    NOT NULL                        -- users.id of the last writer
);

CREATE INDEX IF NOT EXISTS idx_seed_views_seed_position ON seed_views(seed_slug, position);
CREATE INDEX IF NOT EXISTS idx_seed_views_seed_type     ON seed_views(seed_slug, view_type);
