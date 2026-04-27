-- =============================================================================
-- Beech CMS — Initial Schema Migration
-- Version: 0.2.0
--
-- This is the ONLY migration new installations need to run.
-- It creates the complete database schema from scratch with no seed data.
-- No sample content, no dev users — all zeroes, ready for production.
--
-- Usage:
--   npx wrangler d1 execute beech-db --file=migrations/0000_schema_init.sql          (remote)
--   npx wrangler d1 execute beech-db --local --file=migrations/0000_schema_init.sql  (local)
--
-- After running this migration, create your first admin user via:
--   POST /auth/setup  { email, password, name }
-- =============================================================================


-- =============================================================================
-- 1. USERS
--    Stores dashboard users (admins and editors).
--    Passwords are stored as bcrypt hashes — never plaintext.
--    Profile columns (name, avatar_url, notification_prefs) are included
--    from the start (merged from migrations 0001 + 0023).
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    PRIMARY KEY,        -- UUID v4
    email               TEXT    UNIQUE NOT NULL,
    password_hash       TEXT    NOT NULL,           -- bcrypt
    role                TEXT    DEFAULT 'editor',   -- 'admin' | 'editor'
    name                TEXT,
    avatar_url          TEXT,
    notification_prefs  TEXT    NOT NULL DEFAULT '{}',  -- JSON
    created_at          INTEGER DEFAULT (unixepoch())
);


-- =============================================================================
-- 2. CONTENT ENTRIES
--    The single atomic table for all content types.
--    Field data is stored as a JSON blob keyed by Botanical IDs (br01, br02…).
--    slug and status are top-level columns for high-performance SQL indexing.
--    draft_data mirrors data format — NULL means no pending draft.
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_entries (
    id          TEXT    PRIMARY KEY,                    -- UUID v4
    schema_slug TEXT    NOT NULL,                       -- e.g. "articoli"
    slug        TEXT,                                   -- URL identifier (unique per schema_slug)
    status      TEXT    NOT NULL DEFAULT 'draft',       -- 'draft' | 'published'
    data        TEXT    NOT NULL DEFAULT '{}',          -- JSON blob (Botanical IDs)
    draft_data  TEXT,                                   -- Pending draft JSON (NULL = no draft)
    created_at  INTEGER DEFAULT (unixepoch()),
    updated_at  INTEGER DEFAULT (unixepoch())
);

-- Unique constraint: one slug per content type
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_schema_slug
    ON content_entries(schema_slug, slug);

-- Primary query pattern: filtered list + chronological sort
CREATE INDEX IF NOT EXISTS idx_ce_slug_status_created
    ON content_entries(schema_slug, status, created_at DESC);

-- Dashboard "recently updated" widget
CREATE INDEX IF NOT EXISTS idx_ce_slug_updated
    ON content_entries(schema_slug, updated_at DESC);

-- Pending drafts filter (partial index — only rows with a draft)
CREATE INDEX IF NOT EXISTS idx_ce_draft_pending
    ON content_entries(schema_slug) WHERE draft_data IS NOT NULL;


-- =============================================================================
-- 3. REFRESH TOKENS
--    JWT refresh token rotation. Tokens are stored as SHA-256 hashes.
--    Revoked tokens are kept (revoked_at IS NOT NULL) for audit purposes
--    and pruned by a background job or on next login.
-- =============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT    PRIMARY KEY,            -- UUID v4
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,               -- SHA-256 of the raw token
    expires_at  INTEGER NOT NULL,               -- Unix timestamp (7-day TTL)
    created_at  INTEGER DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL            -- NULL = active
);

CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);


-- =============================================================================
-- 4. PASSWORD RESET TOKENS
--    Single-use, 30-minute TTL, stored as SHA-256 hashes.
--    used_at is set on redemption to prevent replay attacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);


-- =============================================================================
-- 5. PUBLIC API — IDEMPOTENCY KEYS
--    Deduplicates POST requests from public consumers (e.g. contact forms).
--    expired_at-based pruning keeps the table small.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_idempotency_keys (
    idempotency_key     TEXT    PRIMARY KEY,
    request_fingerprint TEXT    NOT NULL,
    response_status     INTEGER NOT NULL,
    response_body       TEXT    NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_idempotency_expires
    ON public_idempotency_keys(expires_at);


-- =============================================================================
-- 6. ANALYTICS
--    Daily metric counters per seed (content type) and global (seed = '').
--    The empty string sentinel for global metrics avoids SQLite's NULL ≠ NULL
--    behavior in UNIQUE indexes.
--    Metrics: 'requests' | 'visitors' | 'bandwidth_mb'
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    day_ts  INTEGER NOT NULL,
    metric  TEXT    NOT NULL,
    seed    TEXT    NOT NULL DEFAULT '',    -- '' = global metric, 'articoli' = per-seed
    value   INTEGER DEFAULT 0,
    UNIQUE(day_ts, metric, seed)
);

CREATE INDEX IF NOT EXISTS idx_analytics_day  ON analytics(day_ts);
CREATE INDEX IF NOT EXISTS idx_analytics_seed ON analytics(seed, day_ts);


-- =============================================================================
-- 7. SYSTEM STATS
--    Persistent key-value store for system-level counters.
--    The 'total_storage_bytes' key is the canonical record for R2 usage.
--    SUM(size_bytes) FROM media_objects is the authoritative source;
--    this row is kept for backward compatibility with dashboard widgets.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_stats (
    id    TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO system_stats (id, value) VALUES ('total_storage_bytes', '0');


-- =============================================================================
-- 8. ACTIVITY LOGS (AUDIT LOG)
--    Append-only log of user actions. No FK on user_id for portability —
--    deleted users are retained in the log for compliance.
--    user_name is denormalized to survive user deletions.
--    Actions: 'create' | 'update' | 'delete' | 'upload'
--    Entity types: 'content' | 'media'
-- =============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    user_email  TEXT    NOT NULL,
    user_name   TEXT,                       -- denormalized; survives user deletion
    action      TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    entity_id   TEXT    NOT NULL,
    entity_slug TEXT,
    details     TEXT,                       -- JSON metadata blob
    created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_activity_user    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);


-- =============================================================================
-- 9. NOTIFICATIONS
--    In-app notification inbox for system events (e.g. new form submission).
--    is_read uses INTEGER 0/1 (SQLite has no native BOOLEAN).
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT    PRIMARY KEY,
    title      TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    DEFAULT 'info',  -- 'info' | 'warning' | 'error'
    is_read    INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(is_read);


-- =============================================================================
-- 10. MEDIA OBJECTS
--     Tracks every file uploaded to R2. Enables media library UI, orphan
--     detection, and per-user storage reporting.
--     No FK on uploaded_by (soft reference) for D1 portability.
-- =============================================================================

CREATE TABLE IF NOT EXISTS media_objects (
    key         TEXT    PRIMARY KEY,            -- R2 object key (e.g. "1713600000-img.jpg")
    filename    TEXT    NOT NULL,               -- original filename pre-sanitize
    mime_type   TEXT    NOT NULL,
    size_bytes  INTEGER NOT NULL,
    uploaded_by TEXT    NOT NULL DEFAULT '',    -- users.id soft reference
    created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_user    ON media_objects(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_objects(created_at DESC);


-- =============================================================================
-- 11. FTS5 — FULL TEXT SEARCH
--     Virtual table for global content search across all seeds.
--     entry_id, schema_slug and status are UNINDEXED (used for filtering,
--     not full-text matching).
--     FTS sync is handled at the application layer by shared/fts-sync.ts
--     using the Botanical Engine — no hardcoded branch IDs, works for any seed.
--     Tokenizer: unicode61 with diacritic removal for accent-insensitive search.
-- =============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
    entry_id    UNINDEXED,   -- PK of content_entries
    schema_slug UNINDEXED,   -- for filtering by content type
    title,                   -- displayNameAlias field value
    body,                    -- richtext / text secondary field
    tags,                    -- tags array (JSON array → flat string)
    status      UNINDEXED,   -- for filtering by publication status
    tokenize = 'unicode61 remove_diacritics 1'
);

-- No FTS triggers — sync is application-layer only (see shared/fts-sync.ts).
-- SQL triggers were removed because they hardcoded branch IDs from sample seeds
-- and silently broke indexing for custom seeds (see architecture.md §10).
