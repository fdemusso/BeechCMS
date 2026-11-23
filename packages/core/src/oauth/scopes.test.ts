// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { OAUTH_SCOPES, parseScopeString, formatScopes, isScopeSubset } from './scopes.js'

describe('OAUTH_SCOPES', () => {
  it('lists the 16 v2 scopes with the 1.x pair first and the agent scopes last', () => {
    // 1.x tokens are stored as 'schema:read schema:write' and must keep parsing.
    expect(OAUTH_SCOPES).toEqual([
      'schema:read', 'schema:write',
      'content:read', 'content:write', 'content:delete',
      'media:read', 'media:write',
      'automations:read', 'automations:write',
      'users:read', 'users:write',
      'settings:read', 'settings:write',
      'analytics:read',
      'agent:read', 'agent:approve',
    ])
  })
})

describe('parseScopeString', () => {
  it('parses a v2 scope string', () => {
    expect(parseScopeString('content:read media:write')).toEqual(['content:read', 'media:write'])
  })

  it.each(['agent:write', 'content:*', 'Content:read'])('returns null for the out-of-vocabulary scope %s', raw => {
    // Unknown scopes are invalid_scope, never silently dropped.
    expect(parseScopeString(raw)).toBeNull()
  })

  it('parses a space-delimited list of known scopes', () => {
    expect(parseScopeString('schema:read schema:write')).toEqual(['schema:read', 'schema:write'])
  })

  it('dedupes repeated scopes', () => {
    expect(parseScopeString('schema:read  schema:read')).toEqual(['schema:read'])
  })

  it('returns null for an unknown scope', () => {
    expect(parseScopeString('schema:delete')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseScopeString('')).toBeNull()
  })
})

describe('formatScopes', () => {
  it('round-trips through parseScopeString', () => {
    const scopes = parseScopeString('schema:read schema:write')!
    expect(parseScopeString(formatScopes(scopes))).toEqual(scopes)
  })
})

describe('isScopeSubset', () => {
  it('is true when requested is a subset of granted', () => {
    expect(isScopeSubset(['schema:read'], ['schema:read', 'schema:write'])).toBe(true)
  })

  it('is false when requested exceeds granted', () => {
    expect(isScopeSubset(['schema:read', 'schema:write'], ['schema:read'])).toBe(false)
  })
})
