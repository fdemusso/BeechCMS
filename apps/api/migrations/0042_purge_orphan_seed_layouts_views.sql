-- =============================================================================
-- One-off cleanup of orphan seed_layouts / seed_views rows (#871)
--
--     seed_layouts and seed_views are never cascaded from seeds. Seeds hard-deleted
--     before the #606 fix left rows behind; a seed re-created under the same slug
--     inherited a stale layout and views whose br_* keys no longer match.
-- =============================================================================

DELETE FROM seed_layouts WHERE slug NOT IN (SELECT slug FROM seeds);
DELETE FROM seed_views   WHERE seed_slug NOT IN (SELECT slug FROM seeds);
