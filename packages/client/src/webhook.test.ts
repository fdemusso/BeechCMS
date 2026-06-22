// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { verifyBeechSignature } from './webhook.js'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'

const SECRET = 'my-webhook-secret'
const BODY = '{"event":"entry.created"}'

describe('verifyBeechSignature', () => {
  it('returns true for valid signature', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyBeechSignature(BODY, sig, SECRET)).toBe(true)
  })

  it('returns false for tampered body', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyBeechSignature(BODY + 'tampered', sig, SECRET)).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const sig = await signWebhookBody(BODY, SECRET)
    expect(await verifyBeechSignature(BODY, sig, 'wrong')).toBe(false)
  })

  it('returns false for null signature', async () => {
    expect(await verifyBeechSignature(BODY, null, SECRET)).toBe(false)
  })
})
