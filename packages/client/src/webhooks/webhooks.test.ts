// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  BEECH_SIGNATURE_HEADER,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './index.js'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'

const SECRET = 'test-secret-key-123'
const VALID_PAYLOAD = JSON.stringify({ event: 'entry.published', id: 'art_123', status: 'published' })
const NOW_SECONDS = 1_700_000_000

describe('BEECH_SIGNATURE_HEADER', () => {
  it('has the expected header name', () => {
    expect(BEECH_SIGNATURE_HEADER).toBe('x-beechcms-signature')
  })
})

describe('verifyBeechWebhookSignature', () => {
  it('returns true for a valid Stripe-style t=<sec>,v1=<hex> signature within the tolerance window', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS + 10,
    })
    expect(valid).toBe(true)
  })

  it('supports whitespace after commas and multiple v1 signatures for key rotation', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    const v1 = signature.split('v1=')[1]
    const rotated = `t=${NOW_SECONDS}, v1=${'0'.repeat(64)}, v1=${v1}`
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature: rotated,
      secret: SECRET,
      nowSeconds: NOW_SECONDS,
    })
    expect(valid).toBe(true)
  })

  it('returns false for tampered payload or tampered timestamp', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    const tamperedPayload = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD + 'tampered',
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS,
    })
    const tamperedTimestamp = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature: signature.replace(`t=${NOW_SECONDS}`, `t=${NOW_SECONDS + 1}`),
      secret: SECRET,
      nowSeconds: NOW_SECONDS + 1,
    })
    expect(tamperedPayload).toBe(false)
    expect(tamperedTimestamp).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: 'wrong-secret',
      nowSeconds: NOW_SECONDS,
    })
    expect(valid).toBe(false)
  })

  it('returns false for null / undefined signature', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: null, secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: undefined, secret: SECRET })).toBe(false)
  })

  it('returns false for empty strings', async () => {
    expect(await verifyBeechWebhookSignature({ payload: '', signature: 't=1,v1=abc', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: '', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 't=1,v1=abc', secret: '' })).toBe(false)
  })

  it('returns false for invalid non-hex signature string without throwing', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'not-a-valid-hex-string', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: `t=${NOW_SECONDS},v1=zzzz123`, secret: SECRET, nowSeconds: NOW_SECONDS })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: `t=${NOW_SECONDS},v1=${'0'.repeat(64)}`, secret: SECRET, toleranceSeconds: -1, nowSeconds: NOW_SECONDS })).toBe(false)
  })

  it('rejects signatures outside the tolerance window to prevent replay', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)

    const withinWindow = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS + DEFAULT_WEBHOOK_TOLERANCE_SECONDS - 1,
    })
    const expired = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS + DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 1,
    })
    const futureSkewed = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS - DEFAULT_WEBHOOK_TOLERANCE_SECONDS - 1,
    })

    expect(withinWindow).toBe(true)
    expect(expired).toBe(false)
    expect(futureSkewed).toBe(false)
  })

  it('honors custom toleranceSeconds and null to disable age enforcement', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)

    expect(
      await verifyBeechWebhookSignature({
        payload: VALID_PAYLOAD,
        signature,
        secret: SECRET,
        toleranceSeconds: 60,
        nowSeconds: NOW_SECONDS + 61,
      }),
    ).toBe(false)
    expect(
      await verifyBeechWebhookSignature({
        payload: VALID_PAYLOAD,
        signature,
        secret: SECRET,
        toleranceSeconds: null,
        nowSeconds: NOW_SECONDS + 1_000_000,
      }),
    ).toBe(true)
  })

  it('rejects legacy signatures that omit a timestamp', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    const rawHex = signature.split('v1=')[1]
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: `sha256=${rawHex}`, secret: SECRET, nowSeconds: NOW_SECONDS })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: rawHex, secret: SECRET, nowSeconds: NOW_SECONDS })).toBe(false)
  })
})

describe('constructWebhookEvent', () => {
  it('successfully verifies and parses valid event within tolerance window', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    interface PostEvent { event: string; id: string; status: string }
    const event = await constructWebhookEvent<PostEvent>({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
      nowSeconds: NOW_SECONDS + 5,
    })
    expect(event).toEqual({ event: 'entry.published', id: 'art_123', status: 'published' })
    expect(event.id).toBe('art_123')
  })

  it('throws WebhookVerificationError on missing secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature, secret: '', nowSeconds: NOW_SECONDS }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on missing signature', async () => {
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature: null, secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on invalid signature', async () => {
    await expect(
      constructWebhookEvent({
        payload: VALID_PAYLOAD,
        signature: `t=${NOW_SECONDS},v1=${'0'.repeat(64)}`,
        secret: SECRET,
        nowSeconds: NOW_SECONDS,
      }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on expired timestamp', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET, NOW_SECONDS)
    await expect(
      constructWebhookEvent({
        payload: VALID_PAYLOAD,
        signature,
        secret: SECRET,
        nowSeconds: NOW_SECONDS + DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 1,
      }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('surfaces SyntaxError on malformed JSON payload with valid signature', async () => {
    const invalidJsonPayload = '{"event": "broken'
    const signature = await signWebhookBody(invalidJsonPayload, SECRET, NOW_SECONDS)
    await expect(
      constructWebhookEvent({ payload: invalidJsonPayload, signature, secret: SECRET, nowSeconds: NOW_SECONDS }),
    ).rejects.toThrow(SyntaxError)
  })
})
