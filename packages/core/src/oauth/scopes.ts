// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * OAuth scope vocabulary (v2). Each scope gates a family of operations in
 * `OPERATION_CATALOG`; RBAC still decides what the token's owner may do.
 * `schema:read` / `schema:write` keep their 1.x meaning, so 1.x tokens stay valid.
 * Publish/destructive is not a scope: it is decided per request by risk.
 * `agent:approve` lets a client run an approved intent; it is granted only to the
 * `beech-mcp` client (by `allowed_scopes`), never to the script client.
 */
export const OAUTH_SCOPES = [
  'schema:read', 'schema:write',
  'content:read', 'content:write', 'content:delete',
  'media:read', 'media:write',
  'automations:read', 'automations:write',
  'users:read', 'users:write',
  'settings:read', 'settings:write',
  'analytics:read',
  'agent:read', 'agent:approve',
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

/** Narrows an arbitrary string to a known scope. */
export function isOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value)
}

/**
 * Parses an RFC 6749 §3.3 space-delimited scope string.
 * Returns null if the string is empty or contains any unknown scope — callers
 * must reject the request with `invalid_scope` rather than silently dropping it.
 * Duplicates are collapsed; order is not significant.
 */
export function parseScopeString(raw: string): OAuthScope[] | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const unique = [...new Set(parts)]
  if (!unique.every(isOAuthScope)) return null
  return unique as OAuthScope[]
}

/** Serializes scopes back to the space-delimited wire/storage format. */
export function formatScopes(scopes: readonly OAuthScope[]): string {
  return [...new Set(scopes)].join(' ')
}

/** True when every scope in `requested` is present in `granted`. */
export function isScopeSubset(
  requested: readonly OAuthScope[],
  granted: readonly OAuthScope[],
): boolean {
  return requested.every(scope => granted.includes(scope))
}
