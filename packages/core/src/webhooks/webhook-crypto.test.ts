// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  parseWebhookSignatureHeader,
  signWebhookBody,
  verifyWebhookSignature,
  timingSafeEqual,
} from './webhook-crypto.js'

const SECRET = 'test-secret-key'
const BODY = '{"event":"entry.created","data":{"id":"1"}}'
const NOW_SECONDS = 1_700_000_000

describe('signWebhookBody', () => {
  it('returns Stripe-style t=<unix_sec>,v1=<hex> string', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(sig).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/)
  })

  it('is deterministic for same body, secret, and timestamp', async () => {
    const a = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    const b = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(a).toBe(b)
  })

  it('differs for different bodies or different timestamps', async () => {
    const a = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    const diffBody = await signWebhookBody(BODY + ' ', SECRET, NOW_SECONDS)
    const diffTime = await signWebhookBody(BODY, SECRET, NOW_SECONDS + 1)
    expect(a).not.toBe(diffBody)
    expect(a).not.toBe(diffTime)
  })

  it('rejects negative or non-integer timestamps', async () => {
    await expect(signWebhookBody(BODY, SECRET, -1)).rejects.toThrow(RangeError)
    await expect(signWebhookBody(BODY, SECRET, 12.5)).rejects.toThrow(RangeError)
  })
})

describe('parseWebhookSignatureHeader', () => {
  it('parses timestamp and one or more v1 signatures', () => {
    const hexA = 'a'.repeat(64)
    const hexB = 'b'.repeat(64)
    expect(parseWebhookSignatureHeader(`t=1700000000, v1=${hexA}, v1=${hexB}`)).toEqual({
      timestamp: 1_700_000_000,
      signatures: [hexA, hexB],
    })
  })

  it('returns null when timestamp or v1 is missing or malformed', () => {
    const hex = 'a'.repeat(64)
    expect(parseWebhookSignatureHeader('')).toBeNull()
    expect(parseWebhookSignatureHeader(`sha256=${hex}`)).toBeNull()
    expect(parseWebhookSignatureHeader(`v1=${hex}`)).toBeNull()
    expect(parseWebhookSignatureHeader('t=1700000000')).toBeNull()
    expect(parseWebhookSignatureHeader(`t=abc,v1=${hex}`)).toBeNull()
    expect(parseWebhookSignatureHeader(`t=1,t=2,v1=${hex}`)).toBeNull()
    expect(parseWebhookSignatureHeader('t=1,v1=deadbeef')).toBeNull()
  })
})

describe('verifyWebhookSignature', () => {
  it('returns true for a valid round-trip signature within the tolerance window', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(await verifyWebhookSignature(BODY, sig, SECRET, { nowSeconds: NOW_SECONDS + 10 })).toBe(true)
  })

  it('rejects signatures older than toleranceSeconds', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(
      await verifyWebhookSignature(BODY, sig, SECRET, {
        nowSeconds: NOW_SECONDS + DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
      }),
    ).toBe(true)
    expect(
      await verifyWebhookSignature(BODY, sig, SECRET, {
        nowSeconds: NOW_SECONDS + DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 1,
      }),
    ).toBe(false)
  })

  it('rejects signatures skewed too far into the future', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS + 400)
    expect(await verifyWebhookSignature(BODY, sig, SECRET, { nowSeconds: NOW_SECONDS })).toBe(false)
  })

  it('allows disabling age checks when toleranceSeconds is null', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(
      await verifyWebhookSignature(BODY, sig, SECRET, {
        toleranceSeconds: null,
        nowSeconds: NOW_SECONDS + 999_999,
      }),
    ).toBe(true)
  })

  it('accepts rotated header when any v1 matches', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    const v1 = sig.split('v1=')[1]
    const rotated = `t=${NOW_SECONDS},v1=${'0'.repeat(64)},v1=${v1}`
    expect(await verifyWebhookSignature(BODY, rotated, SECRET, { nowSeconds: NOW_SECONDS })).toBe(true)
  })

  it('rejects legacy sha256= and bare hex formats', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    const hex = sig.split('v1=')[1]
    expect(await verifyWebhookSignature(BODY, `sha256=${hex}`, SECRET, { nowSeconds: NOW_SECONDS })).toBe(false)
    expect(await verifyWebhookSignature(BODY, hex, SECRET, { nowSeconds: NOW_SECONDS })).toBe(false)
  })

  it('returns false for tampered body, wrong secret, null/empty, or malformed signature', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(await verifyWebhookSignature(BODY + 'x', sig, SECRET, { nowSeconds: NOW_SECONDS })).toBe(false)
    expect(await verifyWebhookSignature(BODY, sig, 'wrong-secret', { nowSeconds: NOW_SECONDS })).toBe(false)
    expect(await verifyWebhookSignature(BODY, null, SECRET)).toBe(false)
    expect(await verifyWebhookSignature(BODY, '', SECRET)).toBe(false)
    expect(await verifyWebhookSignature(BODY, 't=1,v1=deadbeef', SECRET)).toBe(false)
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
