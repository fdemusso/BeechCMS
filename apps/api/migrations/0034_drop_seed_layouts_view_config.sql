-- =============================================================================
-- DROP seed_layouts.view_config — superseded by seed_views (0033)
--
--     The per-seed Kanban blob is discarded by product decision (Saved Views
--     brief §4): every seed restarts from the default Kanban instance that
--     seed_views bootstraps. No data is copied.
--
--     The column has no index, trigger, view, foreign key, UNIQUE or PRIMARY
--     KEY constraint, so SQLite (>= 3.35, which D1 runs) drops it in place
--     without a table rebuild.
-- =============================================================================

ALTER TABLE seed_layouts DROP COLUMN view_config;
