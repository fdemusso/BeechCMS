// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolvePolicies, resolveClassification, normalizeClassification, verifyHashField, filterEntryForActor } from './policies.js'
import type { Branch, Seed } from './types.js'


const baseBranch: Branch = {
  id: 'br_01',
  alias: 'field',
  label: 'Field',
  type: 'text',
}

describe('resolveClassification', () => {
  it('resolves public classification by default', () => {
    const res = resolveClassification(baseBranch)
    expect(res.classification).toBe('public')
    expect(res.storage).toBe('plain')
    expect(res.publicVisibility).toBe('full')
    expect(res.authVisibility).toBe('full')
  })

  it('resolves internal classification', () => {
    const res = resolveClassification({ ...baseBranch, policies: { classification: 'internal' } })
    expect(res.classification).toBe('internal')
    expect(res.storage).toBe('plain')
    expect(res.publicVisibility).toBe('hidden')
    expect(res.authVisibility).toBe('full')
  })

  it('resolves confidential classification', () => {
    const res = resolveClassification({ ...baseBranch, policies: { classification: 'confidential' } })
    expect(res.classification).toBe('confidential')
    expect(res.storage).toBe('encrypt')
    expect(res.publicVisibility).toBe('hidden')
    expect(res.authVisibility).toBe('full')
  })

  it('resolves restricted classification', () => {
    const res = resolveClassification({ ...baseBranch, policies: { classification: 'restricted' } })
    expect(res.classification).toBe('restricted')
    expect(res.storage).toBe('hash')
    expect(res.publicVisibility).toBe('hidden')
    expect(res.authVisibility).toBe('hidden')
  })
})

describe('resolvePolicies', () => {
  it('returns all defaults when policies is undefined', () => {
    const result = resolvePolicies(baseBranch)
    expect(result).toEqual({
      classification: 'public',
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
      classification: 'public',
      privacy: 'plain',
      visibility: 'full',
      search: true,
      filter: true,
      sort: true,
      public: true,
    })
  })

  it('privacy: hash defaults visibility to hidden, public to false, sort to false, and search to false', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { privacy: 'hash' } })
    expect(result.classification).toBe('restricted')
    expect(result.privacy).toBe('hash')
    expect(result.visibility).toBe('hidden')
    expect(result.search).toBe(false)
    expect(result.filter).toBe(false)
    expect(result.sort).toBe(false)
    expect(result.public).toBe(false)
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
    expect(result.filter).toBe(false)
    expect(result.sort).toBe(false)
    expect(result.public).toBe(false)
  })

  it('handles visibility: hidden correctly', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { visibility: 'hidden' } })
    expect(result.visibility).toBe('hidden')
  })

  it('privacy: encrypt / confidential defaults visibility to full for authenticated context, sort to false, and search to false', () => {
    const result = resolvePolicies({ ...baseBranch, policies: { privacy: 'encrypt' } })
    expect(result.privacy).toBe('encrypt')
    expect(result.visibility).toBe('full')
    expect(result.sort).toBe(false)
    expect(result.search).toBe(false)
    expect(result.filter).toBe(true)
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

describe('filterEntryForActor', () => {
  const sampleSeed: Seed = {
    slug: 'user_profile',
    label: 'User Profile',
    displayNameAlias: 'name',
    branches: [
      { id: 'br_01', alias: 'name', type: 'text', policies: { classification: 'public' } },
      { id: 'br_02', alias: 'email', type: 'text', policies: { classification: 'internal' } },
      { id: 'br_03', alias: 'ssn', type: 'text', policies: { classification: 'confidential' } },
      { id: 'br_04', alias: 'password_hash', type: 'text', policies: { classification: 'restricted' } },
      { id: 'br_05', alias: 'pin', type: 'text', policies: { classification: 'public', visibility: 'masked' } },
    ],
  }

  const sampleData = {
    id: 'usr_123',
    slug: 'john-doe',
    status: 'published',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    has_pending_draft: false,
    name: 'John Doe',
    email: 'john@example.com',
    ssn: 'SECRET-SSN-123',
    password_hash: '$2b$12$abcdefghijklmnopqrstuv',
    pin: '1234',
    extra: 'unknown_value',
  }

  it('correctly preserves system fields regardless of actor', () => {
    const resPublic = filterEntryForActor(sampleData, sampleSeed, { type: 'public' })
    expect(resPublic.id).toBe('usr_123')
    expect(resPublic.slug).toBe('john-doe')
    expect(resPublic.status).toBe('published')
    expect(resPublic.created_at).toBe('2026-01-01T00:00:00Z')
    expect(resPublic.updated_at).toBe('2026-01-01T00:00:00Z')
    expect(resPublic.version).toBe(1)
    expect(resPublic.has_pending_draft).toBe(false)
  })

  it('omits Internal and Confidential fields when actor is public', () => {
    const res = filterEntryForActor(sampleData, sampleSeed, { type: 'public' })
    expect(res.name).toBe('John Doe')
    expect(res.pin).toBe('••••••••')
    expect(res).not.toHaveProperty('email')
    expect(res).not.toHaveProperty('ssn')
    expect(res).not.toHaveProperty('password_hash')
    expect(res).not.toHaveProperty('extra')
  })

  it('includes Internal and Confidential fields when actor is authenticated', () => {
    const res = filterEntryForActor(sampleData, sampleSeed, { type: 'authenticated' })
    expect(res.name).toBe('John Doe')
    expect(res.email).toBe('john@example.com')
    expect(res.ssn).toBe('SECRET-SSN-123')
    expect(res.pin).toBe('••••••••')
    expect(res.extra).toBe('unknown_value')
  })

  it('ALWAYS omits Restricted fields for both public and authenticated actors', () => {
    const resPublic = filterEntryForActor(sampleData, sampleSeed, { type: 'public' })
    const resAuth = filterEntryForActor(sampleData, sampleSeed, { type: 'authenticated' })
    expect(resPublic).not.toHaveProperty('password_hash')
    expect(resAuth).not.toHaveProperty('password_hash')
  })

  it('retains full access to all fields (including restricted) for system actor', () => {
    const res = filterEntryForActor(sampleData, sampleSeed, { type: 'system' })
    expect(res.name).toBe('John Doe')
    expect(res.email).toBe('john@example.com')
    expect(res.ssn).toBe('SECRET-SSN-123')
    expect(res.password_hash).toBe('$2b$12$abcdefghijklmnopqrstuv')
    expect(res.pin).toBe('1234')
    expect(res.extra).toBe('unknown_value')
  })
})

