-- Password reset tokens: single-use, 30-minute TTL, stored hashed (SHA-256)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER DEFAULT (unixepoch()),
  used_at     INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
