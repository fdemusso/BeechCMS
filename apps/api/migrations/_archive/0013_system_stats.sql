-- Migrazione: Tabella per statistiche di sistema persistenti (es. storage R2)
CREATE TABLE IF NOT EXISTS system_stats (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Inizializzazione contatore storage (in byte)
INSERT OR IGNORE INTO system_stats (id, value) VALUES ('total_storage_bytes', '0');
