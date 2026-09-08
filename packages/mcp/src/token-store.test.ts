// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const GRANT = { accessToken: 'access-1', refreshToken: 'refresh-1', scope: 'schema:read schema:write', expiresAt: Date.now() + 900_000 }

describe('token-store', () => {
  let dir: string
  const originalCache = process.env.BEECH_TOKEN_CACHE

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'beech-mcp-token-store-'))
    process.env.BEECH_TOKEN_CACHE = join(dir, 'nested', 'mcp-tokens.json')
  })

  afterEach(() => {
    if (originalCache === undefined) delete process.env.BEECH_TOKEN_CACHE
    else process.env.BEECH_TOKEN_CACHE = originalCache
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips a grant through write and read', async () => {
    const { readGrant, writeGrant } = await import('./token-store.js')
    writeGrant('http://api.test', 'beech-mcp', GRANT)
    expect(readGrant('http://api.test', 'beech-mcp')).toEqual(GRANT)
  })

  it('returns undefined for a key that was never written', async () => {
    const { readGrant } = await import('./token-store.js')
    expect(readGrant('http://api.test', 'beech-mcp')).toBeUndefined()
  })

  it('isolates grants by cache key (apiUrl + clientId)', async () => {
    const { readGrant, writeGrant } = await import('./token-store.js')
    writeGrant('http://api.test', 'beech-mcp', GRANT)
    expect(readGrant('http://other.test', 'beech-mcp')).toBeUndefined()
    expect(readGrant('http://api.test', 'other-client')).toBeUndefined()
  })

  it('creates the cache file with mode 0600 and its directory with 0700', async () => {
    const { writeGrant, cachePath } = await import('./token-store.js')
    writeGrant('http://api.test', 'beech-mcp', GRANT)
    const fileMode = statSync(cachePath()).mode & 0o777
    const dirMode = statSync(join(dir, 'nested')).mode & 0o777
    expect(fileMode).toBe(0o600)
    expect(dirMode).toBe(0o700)
  })

  it('degrades to undefined on a corrupt cache file instead of throwing', async () => {
    const { readGrant, cachePath } = await import('./token-store.js')
    const path = cachePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{not valid json')
    expect(() => readGrant('http://api.test', 'beech-mcp')).not.toThrow()
    expect(readGrant('http://api.test', 'beech-mcp')).toBeUndefined()
  })

  it('treats a malformed entry (missing fields) as absent', async () => {
    const { readGrant, writeGrant, cachePath } = await import('./token-store.js')
    writeGrant('http://api.test', 'beech-mcp', GRANT)
    const path = cachePath()
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    raw['http://api.test|beech-mcp'].expiresAt = 'not-a-number'
    writeFileSync(path, JSON.stringify(raw))
    expect(readGrant('http://api.test', 'beech-mcp')).toBeUndefined()
  })

  it('clearGrant removes only the targeted key', async () => {
    const { readGrant, writeGrant, clearGrant } = await import('./token-store.js')
    writeGrant('http://api.test', 'beech-mcp', GRANT)
    writeGrant('http://other.test', 'beech-mcp', GRANT)
    clearGrant('http://api.test', 'beech-mcp')
    expect(readGrant('http://api.test', 'beech-mcp')).toBeUndefined()
    expect(readGrant('http://other.test', 'beech-mcp')).toEqual(GRANT)
  })
})
