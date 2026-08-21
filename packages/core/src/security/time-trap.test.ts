// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { generateTimeTrapToken, verifyTimeTrapToken } from './time-trap.js'

describe('Time Trap Security Tokens', () => {
  const SECRET = 'super-secret-key-for-time-trap-testing-12345'

  it('generates and verifies a valid token within time bounds', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 2 // 2 seconds ago
    const token = await generateTimeTrapToken(SECRET, t0)
    expect(token).toMatch(/^t0_\d+\.[0-9a-f]{64}$/)

    const result = await verifyTimeTrapToken(token, SECRET, 1.5, 3600)
    expect(result.valid).toBe(true)
    expect(result.elapsedSeconds).toBeGreaterThanOrEqual(1.5)
  })

  it('rejects submissions that are too fast (< minDeltaSeconds)', async () => {
    const t0 = Math.floor(Date.now() / 1000) // 0 seconds ago (bot submission)
    const token = await generateTimeTrapToken(SECRET, t0)

    const result = await verifyTimeTrapToken(token, SECRET, 1.5, 3600)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Submission too fast')
  })

  it('rejects expired tokens (> maxAgeSeconds)', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 4000 // 4000s ago
    const token = await generateTimeTrapToken(SECRET, t0)

    const result = await verifyTimeTrapToken(token, SECRET, 1.5, 3600)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Token expired')
  })

  it('rejects tokens with forged payloads / invalid signatures', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 5
    const token = await generateTimeTrapToken(SECRET, t0)
    const [payload, sig] = token.split('.')

    // Forged timestamp in payload
    const forgedToken = `t0_${t0 - 10}.${sig}`
    const result = await verifyTimeTrapToken(forgedToken, SECRET, 1.5, 3600)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('signature')
  })

  it('rejects tokens signed with a different secret', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 5
    const token = await generateTimeTrapToken('wrong-secret-key', t0)

    const result = await verifyTimeTrapToken(token, SECRET, 1.5, 3600)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('signature')
  })

  it('rejects malformed or empty token strings', async () => {
    const invalidInputs = ['', 'invalid-format', 't0_12345', 't0_notanumber.deadbeef', null as any, undefined as any]
    for (const input of invalidInputs) {
      const result = await verifyTimeTrapToken(input, SECRET, 1.5, 3600)
      expect(result.valid).toBe(false)
    }
  })
})
