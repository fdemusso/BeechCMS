-- =============================================================================
-- Kanban Foundation
--  kanban_positions : per-(seed, axis, entry) fractional-index ordering.
--                     System table — NEVER a column on content_{slug}.
--  seed_layouts.view_config : additive JSON blob for per-seed dashboard view
--                     preferences (kanban axis/sort/hidden columns). Nullable,
--                     so existing rows are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS kanban_positions (
  seed_slug      TEXT    NOT NULL,
  entry_id       TEXT    NOT NULL,
  axis_branch_id TEXT    NOT NULL,                  -- Branch.id (br_XX), not alias
  position       TEXT    NOT NULL,                  -- fractional-indexing key
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (seed_slug, entry_id, axis_branch_id)
);

-- Column fetch path: ORDER BY position within one (seed, axis).
CREATE INDEX IF NOT EXISTS idx_kanban_positions_column
  ON kanban_positions (seed_slug, axis_branch_id, position);

-- Per-seed dashboard view preferences (KB-S02). Additive, nullable.
ALTER TABLE seed_layouts ADD COLUMN view_config TEXT;
