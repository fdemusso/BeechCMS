CREATE TABLE IF NOT EXISTS public_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_idempotency_expires_at
ON public_idempotency_keys (expires_at);
