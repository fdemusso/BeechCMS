-- =============================================================================
-- Beech CMS v0.4.0 — Base Schema
--
-- Single migration for fresh installations. Creates all system tables.
--
-- Content tables (content_{slug}, fts_{slug}, content_{slug}_drafts) are
-- NOT defined here — they are generated at deploy time by: beech seed:load
-- FTS indexes text + richtext branches (policies.search !== false).
--
-- Usage:
--   wrangler d1 execute beech-db --file=migrations/0000_v040_base.sql          (remote)
--   wrangler d1 execute beech-db --local --file=migrations/0000_v040_base.sql  (local)
--
-- After this migration, run:
--   beech seed:load          → creates content_{slug} tables + FTS + triggers
--   POST /auth/setup         → creates first admin user
-- =============================================================================


-- =============================================================================
-- 1. USERS
--    Dashboard users (admins + editors). Passwords stored as bcrypt hashes.
--    Profile fields (name, avatar_url, notification_prefs) merged in from
--    the start — no incremental ALTER TABLE needed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    NOT NULL PRIMARY KEY,
    email               TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    role                TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    name                TEXT,
    avatar_url          TEXT,
    notification_prefs  TEXT    NOT NULL DEFAULT '{}',
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);


-- =============================================================================
-- 2. REFRESH TOKENS
--    JWT refresh token rotation. Stored as SHA-256 hashes, never plaintext.
--    revoked_at IS NULL = active token.
-- =============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);


-- =============================================================================
-- 3. PASSWORD RESET TOKENS
--    Single-use, 30-minute TTL, stored as SHA-256 hashes.
--    used_at set on redemption to prevent replay attacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);


-- =============================================================================
-- 4. PUBLIC API — IDEMPOTENCY KEYS
--    Deduplicates POST requests from public consumers (e.g. contact forms).
--    expires_at-based pruning keeps the table small.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_idempotency_keys (
    idempotency_key     TEXT    NOT NULL PRIMARY KEY,
    request_fingerprint TEXT    NOT NULL,
    response_status     INTEGER NOT NULL,
    response_body       TEXT    NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public_idempotency_keys(expires_at);


-- =============================================================================
-- 5. ANALYTICS
--    Daily metric counters per seed and global (seed = '' sentinel).
--    Metrics: 'requests' | 'visitors' | 'bandwidth_mb'
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics (
    id      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    day_ts  INTEGER NOT NULL,
    metric  TEXT    NOT NULL,
    seed    TEXT    NOT NULL DEFAULT '',
    value   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(day_ts, metric, seed)
);

CREATE INDEX IF NOT EXISTS idx_analytics_day  ON analytics(day_ts);
CREATE INDEX IF NOT EXISTS idx_analytics_seed ON analytics(seed, day_ts);


-- =============================================================================
-- 6. SYSTEM STATS
--    Persistent key-value store for system-level counters.
--    'total_storage_bytes' is kept for dashboard widgets;
--    SUM(size_bytes) FROM media_objects is the authoritative source.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_stats (
    id    TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO system_stats (id, value) VALUES ('total_storage_bytes', '0');


-- =============================================================================
-- 7. ACTIVITY LOGS
--    Append-only audit log. No FK on user_id — deleted users are retained
--    for compliance. user_name denormalized to survive user deletions.
--    Actions: 'create' | 'update' | 'delete' | 'upload'
--    Entity types: 'content' | 'media'
-- =============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    user_email  TEXT    NOT NULL,
    user_name   TEXT,
    action      TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    entity_id   TEXT    NOT NULL,
    entity_slug TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_activity_user    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);


-- =============================================================================
-- 8. NOTIFICATIONS
--    In-app notification inbox for system events (e.g. new form submission).
--    is_read: 0 = unread, 1 = read.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT    NOT NULL PRIMARY KEY,
    title      TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error')),
    is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(is_read);


-- =============================================================================
-- 9. MEDIA OBJECTS
--    Tracks every file uploaded to R2. Enables media library UI, orphan
--    detection, and storage reporting. No FK on uploaded_by for D1 portability.
-- =============================================================================

CREATE TABLE IF NOT EXISTS media_objects (
    key         TEXT    NOT NULL PRIMARY KEY,
    filename    TEXT    NOT NULL,
    mime_type   TEXT    NOT NULL,
    size_bytes  INTEGER NOT NULL,
    uploaded_by TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_user    ON media_objects(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_objects(created_at DESC);


-- =============================================================================
-- 10. CONTENT EVENT LOG
--     Lightweight event log for activity feed and dashboard stats.
--     Does NOT store field data — only event metadata (who did what, when).
--     Replaces the legacy content_entries table as cross-seed event source.
--     The actual content lives in content_{slug} tables (created by seed:load).
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_event_log (
    id          TEXT    NOT NULL PRIMARY KEY,
    schema_slug TEXT    NOT NULL,
    entry_id    TEXT    NOT NULL,
    action      TEXT    NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    user_id     TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_event_log_schema_slug ON content_event_log(schema_slug);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at  ON content_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_entry_id    ON content_event_log(entry_id);
