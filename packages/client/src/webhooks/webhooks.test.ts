// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  BEECH_SIGNATURE_HEADER,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './index.js'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'

const SECRET = 'test-secret-key-123'
const VALID_PAYLOAD = JSON.stringify({ event: 'entry.published', id: 'art_123', status: 'published' })

describe('BEECH_SIGNATURE_HEADER', () => {
  it('has the expected header name', () => {
    expect(BEECH_SIGNATURE_HEADER).toBe('x-beechcms-signature')
  })
})

describe('verifyBeechWebhookSignature', () => {
  it('returns true for signature with sha256= prefix', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature, secret: SECRET })
    expect(valid).toBe(true)
  })

  it('returns true for signature without prefix (raw hex)', async () => {
    const signatureWithPrefix = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const rawHex = signatureWithPrefix.replace('sha256=', '')
    const valid = await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: rawHex, secret: SECRET })
    expect(valid).toBe(true)
  })

  it('returns false for tampered payload', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD + 'tampered',
      signature,
      secret: SECRET,
    })
    expect(valid).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: 'wrong-secret',
    })
    expect(valid).toBe(false)
  })

  it('returns false for null / undefined signature', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: null, secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: undefined, secret: SECRET })).toBe(false)
  })

  it('returns false for empty strings', async () => {
    expect(await verifyBeechWebhookSignature({ payload: '', signature: 'abc', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: '', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'abc', secret: '' })).toBe(false)
  })

  it('returns false for invalid non-hex signature string without throwing', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'not-a-valid-hex-string', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'sha256=zzzz123', secret: SECRET })).toBe(false)
  })
})

describe('constructWebhookEvent', () => {
  it('successfully verifies and parses valid event', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    interface PostEvent { event: string; id: string; status: string }
    const event = await constructWebhookEvent<PostEvent>({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
    })
    expect(event).toEqual({ event: 'entry.published', id: 'art_123', status: 'published' })
    expect(event.id).toBe('art_123')
  })

  it('throws WebhookVerificationError on missing secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature, secret: '' }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on missing signature', async () => {
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature: null, secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on invalid signature', async () => {
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000', secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('surfaces SyntaxError on malformed JSON payload with valid signature', async () => {
    const invalidJsonPayload = '{"event": "broken'
    const signature = await signWebhookBody(invalidJsonPayload, SECRET)
    await expect(
      constructWebhookEvent({ payload: invalidJsonPayload, signature, secret: SECRET }),
    ).rejects.toThrow(SyntaxError)
  })
})
