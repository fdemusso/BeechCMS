-- =============================================================================
-- WIDEN seeded OAuth clients to the v2 scope vocabulary
--
--     `allowed_scopes` caps what a client may request. The seeded clients
--     `beech-mcp` and `beech-mcp-cli` now accept all 14 v2 scopes.
--
--     Must ship together with the widened OAUTH_SCOPES in @beechcms/core:
--     repositories parse stored scope strings and an unknown scope empties the
--     row. Existing consents and tokens are untouched; 1.x grants stay valid.
--
--     `agent:approve` is added to `beech-mcp` by a later migration (ROADMAP §4.5).
-- =============================================================================

UPDATE oauth_clients
SET allowed_scopes = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read'
WHERE client_id IN ('beech-mcp', 'beech-mcp-cli');
