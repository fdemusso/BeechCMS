-- =============================================================================
-- Beech CMS v0.4.0 — Doctype Architecture
--
-- Breaking change: da singola tabella content_entries (JSON blob) a tabelle
-- dedicate per Seed con colonne reali tipizzate.
--
-- Questa migration:
--   1. Rimuove content_entries (i dati di campo migrano a content_{slug})
--   2. Rimuove content_fts (sostituita da fts_{slug} per-Seed con trigger)
--   3. Crea content_event_log (ex content_entries, solo metadati)
--
-- Le tabelle content_{slug} e fts_{slug} NON sono in questa migration.
-- Vengono create da: beech seed:load
--
-- Fresh start (dati non migrati):
--   npm run db:reset:local      → applica tutte le migration
--   beech seed:load --local     → crea tabelle content e FTS per ogni Seed
-- =============================================================================


-- =============================================================================
-- 1. RIMOZIONE SCHEMA LEGACY
-- =============================================================================

-- Rimuove la vecchia FTS5 globale (sostituita da fts_{slug} per-Seed)
DROP TABLE IF EXISTS content_fts;

-- Rimuove la tabella monolitica (i dati non vengono migrati — fresh start)
DROP TABLE IF EXISTS content_entries;


-- =============================================================================
-- 2. CONTENT EVENT LOG
--    Tabella leggera per activity feed e stats del dashboard.
--    NON contiene dati di campo (solo metadati dell'evento CRUD).
--    Rimpiazza content_entries come sorgente per activity_logs cross-seed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_event_log (
    id          TEXT    NOT NULL PRIMARY KEY,    -- UUID v4
    schema_slug TEXT    NOT NULL,                -- es. "articoli"
    entry_id    TEXT    NOT NULL,                -- ID dell'entry nella tabella content_{slug}
    action      TEXT    NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    user_id     TEXT,                            -- NULL = azione pubblica (API key)
    details     TEXT,                            -- JSON opzionale: {title, name, ...} per display
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_event_log_schema_slug ON content_event_log(schema_slug);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at  ON content_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_entry_id    ON content_event_log(entry_id);
