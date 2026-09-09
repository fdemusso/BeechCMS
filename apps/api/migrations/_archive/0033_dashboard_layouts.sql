-- =============================================================================
-- Dashboard Layouts — per-scope dashboard composer layouts
--
-- `dashboard_layouts` : one row per scope. Sprint 02 only ever writes the
--                        literal 'default' scope; Sprint 06 introduces
--                        role-scoped rows ('role:admin', 'role:editor', ...).
-- =============================================================================

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  scope        TEXT NOT NULL PRIMARY KEY,   -- 'default' | 'role:admin' | 'role:editor'
  layout       TEXT NOT NULL,               -- JSON of DashboardLayout
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by   TEXT NOT NULL                -- users.id of the writer
);
