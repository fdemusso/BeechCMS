-- =============================================================================
-- OAUTH 2.1 AUTHORIZATION SERVER
-- Authorization code + PKCE grant. Every credential (code, access token, refresh
-- token) is persisted as a SHA-256 hex hash only — never plaintext — replicating
-- the refresh_tokens contract in 0000_v040_base.sql.
-- Expired rows are filtered at read time via expires_at; no background pruning job.
-- =============================================================================

-- 1. CLIENTS -----------------------------------------------------------------
-- Static registry. No dynamic client registration (RFC 7591) is supported.
CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id       TEXT    NOT NULL PRIMARY KEY,
    name            TEXT    NOT NULL,
    redirect_uris   TEXT    NOT NULL,                       -- JSON array of strings
    allowed_scopes  TEXT    NOT NULL,                       -- space-delimited, RFC 6749 §3.3
    is_public       INTEGER NOT NULL DEFAULT 1
                            CHECK (is_public IN (0, 1)),    -- 1 = public client, no secret
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    disabled_at     INTEGER DEFAULT NULL
);

-- 2. AUTHORIZATION CODES -----------------------------------------------------
-- Single use. consumed_at is set on first redemption; a second redemption of the
-- same code must cascade-revoke every token issued from it (OAuth 2.1 replay
-- mitigation) via oauth_tokens.authorization_code_hash.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    code_hash               TEXT    NOT NULL PRIMARY KEY,
    client_id               TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope                   TEXT    NOT NULL,               -- space-delimited granted scopes
    redirect_uri            TEXT    NOT NULL,
    code_challenge          TEXT    NOT NULL,
    code_challenge_method   TEXT    NOT NULL DEFAULT 'S256'
                                    CHECK (code_challenge_method = 'S256'),
    expires_at              INTEGER NOT NULL,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
    consumed_at             INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user    ON oauth_authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);

-- 3. TOKENS ------------------------------------------------------------------
-- Access and refresh tokens share one table: identical lifecycle, distinguished
-- by token_type. authorization_code_hash links a token back to its originating
-- code so replay of that code can revoke the whole family in one UPDATE.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id                      TEXT    NOT NULL PRIMARY KEY,
    token_hash              TEXT    NOT NULL,
    token_type              TEXT    NOT NULL
                                    CHECK (token_type IN ('access', 'refresh')),
    client_id               TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id                 TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope                   TEXT    NOT NULL,               -- space-delimited
    authorization_code_hash TEXT    NOT NULL,
    expires_at              INTEGER NOT NULL,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at              INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_hash    ON oauth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_code    ON oauth_tokens(authorization_code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client  ON oauth_tokens(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user    ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);

-- 4. CONSENTS ---------------------------------------------------------------
-- One live row per (client, user). scopes holds the cumulative granted set, so a
-- repeat authorize request for an already-granted subset can skip the consent
-- screen, while a superset must re-prompt for the delta only.
CREATE TABLE IF NOT EXISTS oauth_consents (
    id          TEXT    NOT NULL PRIMARY KEY,
    client_id   TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes      TEXT    NOT NULL,                           -- space-delimited
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_consents_pair ON oauth_consents(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_consents_user ON oauth_consents(user_id);

-- 5. SEEDED CLIENT -----------------------------------------------------------
-- The MCP server is the only client today. Loopback redirect per OAuth 2.1
-- §8.4.2: the port is assigned at runtime by the local listener, so Sprint 2
-- matches host+path and ignores the port. No client secret: public client.
INSERT OR IGNORE INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes, is_public)
VALUES (
    'beech-mcp-cli',
    'BeechCMS MCP Server',
    '["http://127.0.0.1/callback"]',
    'schema:read schema:write',
    1
);
