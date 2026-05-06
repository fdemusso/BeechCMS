-- Migrazione: Tabella Refresh Tokens per JWT rotation
-- Salva refresh tokens con hash SHA-256 per sicurezza e possibilità di revoca
-- Idempotente: IF NOT EXISTS per esecuzioni ripetute

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,              -- UUID del token
    user_id TEXT NOT NULL,            -- Riferimento a users.id
    token_hash TEXT NOT NULL,         -- Hash SHA-256 del token (non salvare in chiaro)
    expires_at INTEGER NOT NULL,      -- Unix timestamp scadenza (7 giorni)
    created_at INTEGER DEFAULT (unixepoch()),
    revoked_at INTEGER DEFAULT NULL,  -- NULL = attivo, timestamp = revocato
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
