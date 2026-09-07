-- =============================================================================
-- OAUTH CLIENT REGISTRY — @beechcms/mcp
-- Static registration of the first-party MCP client. 0038 declares the registry
-- static (no RFC 7591 dynamic registration), so the row is seeded by migration.
-- Public client (is_public = 1): a stdio CLI cannot hold a secret, PKCE S256 is
-- the proof of possession instead.
-- The redirect URI is registered WITHOUT a port: matchesRegisteredRedirectUri()
-- compares loopback URIs on protocol + hostname + pathname only (OAuth 2.1
-- §8.4.2), because the CLI binds an ephemeral port at runtime.
-- Idempotent: INSERT OR IGNORE keeps `beech db:reset` and re-runs safe.
-- =============================================================================

INSERT OR IGNORE INTO oauth_clients (client_id, name, redirect_uris, allowed_scopes, is_public)
VALUES (
    'beech-mcp',
    'BeechCMS MCP Server',
    '["http://127.0.0.1/oauth/callback"]',
    'schema:read schema:write',
    1
);
