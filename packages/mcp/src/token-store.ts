// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * On-disk cache for OAuth grants issued to the MCP server, keyed by API URL + client id.
 *
 * @remarks
 * Persists between MCP server restarts so a user does not re-authorize in the browser
 * on every tool call. Protected by file mode `0600`, the same trust model as `.dev.vars`.
 * Every exported function swallows its own I/O errors: a corrupt or unwritable cache
 * must degrade to "re-authorize", never crash the stdio server.
 *
 * @module
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** A grant persisted between MCP server restarts. Plaintext by necessity: the
 *  client must replay the refresh token. Protected by file mode 0600, the same
 *  trust model as `.dev.vars`. */
export interface CachedGrant {
  /** Opaque 64-hex access token issued by `POST /oauth/token`. */
  accessToken: string
  /** Opaque 64-hex refresh token. Rotated on every refresh. */
  refreshToken: string
  /** Space-delimited scopes actually granted (may be narrower than requested). */
  scope: string
  /** Absolute expiry of `accessToken`, epoch milliseconds. */
  expiresAt: number
}

/** File shape: one entry per `${apiUrl}|${clientId}` pair. */
type TokenCacheFile = Record<string, CachedGrant>

/** Cache location. Overridable so tests never touch the real home directory. */
export function cachePath(): string {
  return process.env.BEECH_TOKEN_CACHE ?? join(homedir(), '.beechcms', 'mcp-tokens.json')
}

/** Cache key. Distinct API instances (local vs remote `BEECH_API_URL`) never
 *  share a grant — a token minted by one is invalid at the other. */
export function cacheKey(apiUrl: string, clientId: string): string {
  return `${apiUrl}|${clientId}`
}

/** Validates a parsed cache entry before trusting it as a {@link CachedGrant}. */
function isValidGrant(value: unknown): value is CachedGrant {
  if (!value || typeof value !== 'object') return false
  const grant = value as Partial<CachedGrant>
  return (
    typeof grant.accessToken === 'string' && grant.accessToken.length > 0 &&
    typeof grant.refreshToken === 'string' && grant.refreshToken.length > 0 &&
    typeof grant.scope === 'string' && grant.scope.length > 0 &&
    typeof grant.expiresAt === 'number' && Number.isFinite(grant.expiresAt)
  )
}

function readCacheFile(): TokenCacheFile {
  const path = cachePath()
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed as TokenCacheFile
}

/** Reads the cached grant. Returns undefined on a missing, unreadable, or
 *  malformed file: a corrupt cache must degrade to "re-authorize", never
 *  throw and take the stdio server down. */
export function readGrant(apiUrl: string, clientId: string): CachedGrant | undefined {
  try {
    const entry = readCacheFile()[cacheKey(apiUrl, clientId)]
    return isValidGrant(entry) ? entry : undefined
  } catch {
    return undefined
  }
}

/** Writes the grant atomically (tmp file -> chmod 0600 -> rename), creating
 *  `~/.beechcms` with mode 0700 if absent. Silently gives up on write failure:
 *  a read-only home means "authorize every session", not "crash". */
export function writeGrant(apiUrl: string, clientId: string, grant: CachedGrant): void {
  try {
    const path = cachePath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    let cache: TokenCacheFile
    try {
      cache = readCacheFile()
    } catch {
      cache = {}
    }
    cache[cacheKey(apiUrl, clientId)] = grant
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(cache))
    chmodSync(tmpPath, 0o600)
    renameSync(tmpPath, path)
  } catch {
    // Read-only home, permission denied, or disk full: degrade to re-authorize.
  }
}

/** Removes the entry for one key. Used when a refresh token is rejected. */
export function clearGrant(apiUrl: string, clientId: string): void {
  try {
    const path = cachePath()
    if (!existsSync(path)) return
    const cache = readCacheFile()
    delete cache[cacheKey(apiUrl, clientId)]
    if (Object.keys(cache).length === 0) {
      unlinkSync(path)
      return
    }
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(cache))
    chmodSync(tmpPath, 0o600)
    renameSync(tmpPath, path)
  } catch {
    // Best-effort: a stale entry surviving is not worse than a crash here.
  }
}
