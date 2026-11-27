-- =============================================================================
-- USER MFA: TOTP second-factor enrolment, one row per user
--
--     No row means the user has no second factor. `pending` is a secret shown
--     once and not yet confirmed; `active` is enforced at sign-in. A separate
--     table keeps credential material out of every SELECT ... FROM users.
--
--     `secret_ciphertext` is a `v1:` AES-GCM envelope sealed with
--     MFA_ENCRYPTION_KEY (the key is never stored in D1) and bound to the
--     user id. `last_used_step` is the last accepted TOTP time step, the
--     replay guard.
--
--     Lost-authenticator procedure for a developer: delete the user's row.
--     There is no backfill: existing users start with no second factor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_mfa (
  user_id            TEXT    NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT    NOT NULL CHECK (status IN ('pending', 'active')),
  secret_ciphertext  TEXT    NOT NULL,
  last_used_step     INTEGER,
  created_at         INTEGER NOT NULL,
  activated_at       INTEGER
);
