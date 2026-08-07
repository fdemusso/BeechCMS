// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { applyPrivacy, applyVisibility, PrivacyPolicyError } from './apply-policies'
import type { Seed } from '@beechcms/core'

function makeSeed(branches: any[]): Seed {
  return { slug: 'test', displayNameAlias: 'title', branches } as unknown as Seed
}

// ─── applyPrivacy ─────────────────────────────────────────────────────────────

describe('applyPrivacy', () => {
  it('passes through fields with no privacy policy (default: public)', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'title', type: 'text' }])
    const result = await applyPrivacy({ title: 'Hello' }, seed)
    expect(result.title).toBe('Hello')
  })

  it('hashes the value when branch privacy is "hash"', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'email', type: 'text', policies: { privacy: 'hash' } }])
    const result = await applyPrivacy({ email: 'user@test.com' }, seed)
    // sha256 produces a 64-char hex string
    expect(typeof result.email).toBe('string')
    expect((result.email as string).length).toBe(64)
    expect(result.email).not.toBe('user@test.com')
  })

  it('produces distinct hashes for distinct json objects (no [object Object] collision)', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'answers', type: 'json', policies: { privacy: 'hash' } }])
    const result1 = await applyPrivacy({ answers: { userId: 1 } }, seed)
    const result2 = await applyPrivacy({ answers: { userId: 2 } }, seed)
    expect(result1.answers).not.toBe(result2.answers)
  })

  it('leaves null/undefined values unhashed even when privacy is "hash"', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'email', type: 'text', policies: { privacy: 'hash' } }])
    const result = await applyPrivacy({ email: null }, seed)
    expect(result.email).toBeNull()
  })

  it('throws PrivacyPolicyError for "encrypt" privacy (not yet implemented)', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'secret', type: 'text', policies: { privacy: 'encrypt' } }])
    await expect(applyPrivacy({ secret: 'value' }, seed)).rejects.toBeInstanceOf(PrivacyPolicyError)
  })

  it('passes through fields not present in the seed branches unchanged', async () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'title', type: 'text' }])
    const result = await applyPrivacy({ title: 'Hi', extraField: 'extra' }, seed)
    expect(result.extraField).toBe('extra')
  })
})

// ─── applyVisibility ──────────────────────────────────────────────────────────

describe('applyVisibility', () => {
  it('includes fields with default (visible) visibility', () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'title', type: 'text' }])
    const result = applyVisibility({ title: 'Hello' }, seed)
    expect(result.title).toBe('Hello')
  })

  it('omits fields with visibility "hidden"', () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'internal', type: 'text', policies: { visibility: 'hidden' } }])
    const result = applyVisibility({ internal: 'secret' }, seed)
    expect(result).not.toHaveProperty('internal')
  })

  it('masks non-empty string fields with visibility "masked"', () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'password', type: 'text', policies: { visibility: 'masked' } }])
    const result = applyVisibility({ password: 'secret123' }, seed)
    expect(result.password).toBe('••••••••')
  })

  it('returns null for empty string fields with visibility "masked"', () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'password', type: 'text', policies: { visibility: 'masked' } }])
    const result = applyVisibility({ password: '' }, seed)
    expect(result.password).toBeNull()
  })

  it('passes through fields not present in the seed branches', () => {
    const seed = makeSeed([{ id: 'br_01', alias: 'title', type: 'text' }])
    const result = applyVisibility({ title: 'Hi', extraField: 'pass' }, seed)
    expect(result.extraField).toBe('pass')
  })

  it('respects ActorContext classification rules for public vs authenticated vs system actors', () => {
    const seed = makeSeed([
      { id: 'br_01', alias: 'pub', type: 'text', policies: { classification: 'public' } },
      { id: 'br_02', alias: 'internal', type: 'text', policies: { classification: 'internal' } },
      { id: 'br_03', alias: 'confidential', type: 'text', policies: { classification: 'confidential' } },
      { id: 'br_04', alias: 'restricted', type: 'text', policies: { classification: 'restricted' } },
    ])
    const payload = { pub: 'v1', internal: 'v2', confidential: 'v3', restricted: 'v4' }

    const pubRes = applyVisibility(payload, seed, { type: 'public' })
    expect(pubRes).toEqual({ pub: 'v1' })

    const authRes = applyVisibility(payload, seed, { type: 'authenticated' })
    expect(authRes).toEqual({ pub: 'v1', internal: 'v2', confidential: 'v3' })

    const sysRes = applyVisibility(payload, seed, { type: 'system' })
    expect(sysRes).toEqual({ pub: 'v1', internal: 'v2', confidential: 'v3', restricted: 'v4' })
  })
})

