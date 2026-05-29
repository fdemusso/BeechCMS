// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolvePolicies, verifyHashField } from './policies'
import type { Branch } from './types'

const baseBranch: Branch = {
  id: 'br_01',
  alias: 'field',
  label: 'Field',
  type: 'text',
}

describe('resolvePolicies', () => {
  it('returns all defaults when policies is undefined', () => {
    const result = resolvePolicies(baseBranch)
    expect(result).toEqual({
      privacy: 'plain',
      visibility: 'full',
      search: true,
      filter: true,
      sort: true,
      public: true,
    })
  })

  it('returns all defaults when policies is an empty object', () => {
    const result = resolvePolicies({ ...baseBranch, policies: {} })
    expect(result).toEqual({
      privacy: 'plain',
      visibility: 'full',
      search: true,
      filter: true,
      sort: true,
      public: true,
    })
  })

  it('privacy: hash defaults visibility to hidden', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { privacy: 'hash' } })
    expect(result.privacy).toBe('hash')
    expect(result.visibility).toBe('hidden')
    expect(result.search).toBe(true)
    expect(result.filter).toBe(true)
    expect(result.sort).toBe(true)
    expect(result.public).toBe(true)
  })

  it('privacy: hash with explicit visibility overrides the default', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { privacy: 'hash', visibility: 'masked' } })
    expect(result.privacy).toBe('hash')
    expect(result.visibility).toBe('masked')
  })

  it('overrides visibility independently without affecting other defaults', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { visibility: 'masked' } })
    expect(result.visibility).toBe('masked')
    expect(result.privacy).toBe('plain')
    expect(result.search).toBe(true)
  })

  it('overrides search: false independently', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { search: false } })
    expect(result.search).toBe(false)
    expect(result.filter).toBe(true)
    expect(result.sort).toBe(true)
    expect(result.public).toBe(true)
  })

  it('overrides filter: false independently', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { filter: false } })
    expect(result.filter).toBe(false)
    expect(result.search).toBe(true)
    expect(result.sort).toBe(true)
  })

  it('overrides sort: false independently', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { sort: false } })
    expect(result.sort).toBe(false)
    expect(result.filter).toBe(true)
    expect(result.search).toBe(true)
  })

  it('overrides public: false independently', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { public: false } })
    expect(result.public).toBe(false)
    expect(result.visibility).toBe('full')
  })

  it('handles multiple overrides simultaneously', () => {
    const result = resolvePolicies({
      ...baseBranch,
      policies: { privacy: 'hash', visibility: 'hidden', search: false, public: false },
    })
    expect(result.privacy).toBe('hash')
    expect(result.visibility).toBe('hidden')
    expect(result.search).toBe(false)
    expect(result.filter).toBe(true)
    expect(result.sort).toBe(true)
    expect(result.public).toBe(false)
  })

  it('handles visibility: hidden correctly', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { visibility: 'hidden' } })
    expect(result.visibility).toBe('hidden')
  })

  it('privacy: encrypt defaults visibility to hidden', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { privacy: 'encrypt' } })
    expect(result.privacy).toBe('encrypt')
    expect(result.visibility).toBe('hidden')
  })
})

describe('verifyHashField', () => {
  it('returns true when candidate matches stored hash', async () => {
    const candidate = 'mysecretpassword'
    // pre-compute the expected hash
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate))
    const stored = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await verifyHashField(stored, candidate)).toBe(true)
  })

  it('returns false when candidate does not match stored hash', async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('correct'))
    const stored = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await verifyHashField(stored, 'wrong')).toBe(false)
  })
})
