-- =============================================================================
-- Beech CMS v0.4.0 — Setup Lock
-- Single-row marker enforcing that /auth/setup can only complete once, even
-- under concurrent requests. Insert into this table in the same transaction
-- as the initial admin user; the PRIMARY KEY conflict rejects the loser.
-- =============================================================================

CREATE TABLE IF NOT EXISTS setup_completed (
    id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1)
);
