-- =============================================================================
-- AGENT INTENTS: risky OAuth requests stored for a human decision
--
--     A publish/destructive request made with an OAuth token is stored here
--     instead of running. The owner approves it (the server then replays the
--     stored request once) or rejects it; it expires after 10 minutes.
--
--     Must ship together with the 16-scope OAUTH_SCOPES in @beechcms/core:
--     repositories parse stored scope strings and an unknown scope empties the
--     row. `agent:approve` is granted to the `beech-mcp` client only, never to
--     the script client `beech-mcp-cli`. Existing consents and tokens are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_intents (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT    NOT NULL,
  operation_id  TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  body          TEXT,
  body_hash     TEXT    NOT NULL,
  risk          TEXT    NOT NULL CHECK (risk IN ('publish', 'destructive')),
  summary       TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  result_status INTEGER,
  result_body   TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  decided_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_intents_user_status ON agent_intents(user_id, status);

UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read agent:approve'
WHERE client_id = 'beech-mcp';

UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read'
WHERE client_id = 'beech-mcp-cli';
