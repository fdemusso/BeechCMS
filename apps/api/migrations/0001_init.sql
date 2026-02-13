-- Migrazione iniziale: Struttura Base Beech CMS

-- 1. Tabella UTENTI (Per il login)
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id TEXT PRIMARY KEY,            -- UUID generato via codice
    email TEXT UNIQUE NOT NULL,     -- Email di login
    password_hash TEXT NOT NULL,    -- Password criptata
    role TEXT DEFAULT 'editor',     -- Ruolo: 'admin' o 'editor'
    created_at INTEGER DEFAULT (unixepoch())
);

-- 2. Tabella CONTENUTI (Per i dati flessibili JSON)
DROP TABLE IF EXISTS content_entries;
CREATE TABLE content_entries (
    id TEXT PRIMARY KEY,            -- UUID
    schema_slug TEXT NOT NULL,      -- Tipo contenuto (es. 'progetti', 'blog')
    status TEXT DEFAULT 'draft',    -- Stato: 'draft' | 'published'
    data TEXT,                      -- IL JSON: Qui dentro salviamo tutto il resto
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 3. Indici per velocizzare le ricerche
CREATE INDEX idx_content_schema ON content_entries(schema_slug);