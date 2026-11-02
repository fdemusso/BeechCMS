-- =============================================================================
-- DROP users.role — the legacy authorization axis leaves (brief rule 27)
--
--     Authority comes only from RBAC assignments since the legacy role gates
--     were replaced. No data is kept (brief §5): the column is read by nothing.
--
--     The CHECK (role IN ('admin', 'editor')) is the column's own, and no
--     index, trigger or view names the column, so SQLite (>= 3.35, which D1
--     runs) drops it in place without a table rebuild.
-- =============================================================================

ALTER TABLE users DROP COLUMN role;
