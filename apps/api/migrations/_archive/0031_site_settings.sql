-- =============================================================================
-- Beech CMS v0.4.0 — Site Settings
-- Key-value store for site-level configuration (title, locale, timezone, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS site_settings (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
