-- =============================================================================
-- PUBLIC TIME-TRAP TOKENS
-- Single-use tracking for HMAC time-trap tokens to prevent replay attacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_time_trap_tokens (
    token_hash  TEXT    NOT NULL PRIMARY KEY,
    used_at     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_trap_tokens_expires
ON public_time_trap_tokens (expires_at);
