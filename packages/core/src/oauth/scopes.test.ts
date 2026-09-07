// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { parseScopeString, formatScopes, isScopeSubset } from './scopes.js'

describe('parseScopeString', () => {
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
