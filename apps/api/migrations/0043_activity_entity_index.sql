-- =============================================================================
-- Index activity_logs by entity id
--
--     GET /api/search resolves the last writer of every result entry by
--     entity_id on each query. activity_logs was indexed only on user_id and
--     created_at, so that lookup would scan the whole append-only table.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_id, created_at);
