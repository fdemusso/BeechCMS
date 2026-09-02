// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { signWebhookBody, verifyWebhookSignature, timingSafeEqual } from './webhook-crypto.js'

const SECRET = 'test-secret-key'
const BODY = '{"event":"entry.created","data":{"id":"1"}}'

describe('signWebhookBody', () => {
  it('returns sha256= prefixed hex string', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('is deterministic for same inputs', async () => {
    const a = await signWebhookBody(BODY, SECRET)
    const b = await signWebhookBody(BODY, SECRET)
    expect(a).toBe(b)
  })

  it('differs for different bodies', async () => {
    const a = await signWebhookBody(BODY, SECRET)
    const b = await signWebhookBody(BODY + ' ', SECRET)
    expect(a).not.toBe(b)
  })
})

describe('verifyWebhookSignature', () => {
  it('returns true for a valid round-trip signature', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyWebhookSignature(BODY, sig, SECRET)).toBe(true)
  })

  it('accepts signature without sha256= prefix', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    const bare = sig.replace('sha256=', '')
    expect(await verifyWebhookSignature(BODY, bare, SECRET)).toBe(true)
  })

  it('returns false for tampered body', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyWebhookSignature(BODY + 'x', sig, SECRET)).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyWebhookSignature(BODY, sig, 'wrong-secret')).toBe(false)
  })

  it('returns false for null signature', async () => {
    expect(await verifyWebhookSignature(BODY, null, SECRET)).toBe(false)
  })

  it('returns false for empty signature', async () => {
    expect(await verifyWebhookSignature(BODY, '', SECRET)).toBe(false)
  })

  it('returns false for malformed signature (wrong length)', async () => {
    expect(await verifyWebhookSignature(BODY, 'sha256=deadbeef', SECRET)).toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('my-secret-key', 'my-secret-key')).toBe(true)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('returns false for strings of different length', () => {
    expect(timingSafeEqual('short', 'longer-string')).toBe(false)
    expect(timingSafeEqual('longer-string', 'short')).toBe(false)
    expect(timingSafeEqual('', 'a')).toBe(false)
  })

  it('returns false for differences at start, middle, or end', () => {
    expect(timingSafeEqual('Xbcdef', 'abcdef')).toBe(false)
    expect(timingSafeEqual('abcXef', 'abcdef')).toBe(false)
    expect(timingSafeEqual('abcdeX', 'abcdef')).toBe(false)
  })
})
