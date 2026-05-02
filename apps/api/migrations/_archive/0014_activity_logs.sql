-- Migrazione: Tabella per il log delle attività (Audit Log)
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,        -- 'create' | 'update' | 'delete' | 'upload'
    entity_type TEXT NOT NULL,   -- 'content' | 'media'
    entity_id TEXT NOT NULL,     -- UUID o Key R2
    entity_slug TEXT,            -- Slug del seed (es. 'progetti') o null
    details TEXT,                -- JSON con metadati (es. { title: '...' })
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
