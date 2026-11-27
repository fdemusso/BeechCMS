// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { signWebhookBody, verifyWebhookSignature, timingSafeEqual } from './webhook-crypto.js'

const SECRET = 'test-secret-key'
const BODY = '{"event":"entry.created","data":{"id":"1"}}'
const NOW_SECONDS = 1_700_000_000

describe('webhook-crypto re-export', () => {
  it('re-exports timestamped signing and verification from webhooks/webhook-crypto', async () => {
    const sig = await signWebhookBody(BODY, SECRET, NOW_SECONDS)
    expect(sig).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/)
    expect(await verifyWebhookSignature(BODY, sig, SECRET, { nowSeconds: NOW_SECONDS })).toBe(true)
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
  })
})
