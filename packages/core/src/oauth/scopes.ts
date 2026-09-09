// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * OAuth scope vocabulary. Scopes map 1:1 onto the MCP tools exposed today; no
 * speculative scopes are defined.
 *
 * - `schema:read`  -> beech_list_seeds, beech_get_seed, beech_schema_export,
 *                     beech_schema_validate, beech_schema_plan
 * - `schema:write` -> beech_schema_apply
 *
 * `beech_schema_plan` is deliberately classified as READ: despite the imperative
 * name it is a dry-run that computes a migration plan and mutates nothing.
 */
export const OAUTH_SCOPES = ['schema:read', 'schema:write'] as const

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
