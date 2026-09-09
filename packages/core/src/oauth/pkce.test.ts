// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { verifyPkceChallenge } from './pkce.js'

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('verifyPkceChallenge', () => {
  it('verifies the RFC 7636 §B fixture', async () => {
    expect(await verifyPkceChallenge(VERIFIER, CHALLENGE, 'S256')).toBe(true)
  })

  it('rejects the plain method unconditionally', async () => {
    expect(await verifyPkceChallenge(VERIFIER, CHALLENGE, 'plain')).toBe(false)
  })

  it('rejects a wrong verifier', async () => {
    expect(await verifyPkceChallenge('a'.repeat(43), CHALLENGE, 'S256')).toBe(false)
  })

  it('rejects a verifier shorter than the minimum length', async () => {
    expect(await verifyPkceChallenge('a'.repeat(42), CHALLENGE, 'S256')).toBe(false)
  })

  it('rejects a verifier containing an invalid character', async () => {
    expect(await verifyPkceChallenge(`${'a'.repeat(42)}+`, CHALLENGE, 'S256')).toBe(false)
  })

  it('never throws on an empty verifier', async () => {
    await expect(verifyPkceChallenge('', CHALLENGE, 'S256')).resolves.toBe(false)
  })

  it('never throws on a challenge of a different length', async () => {
    await expect(verifyPkceChallenge(VERIFIER, 'short', 'S256')).resolves.toBe(false)
  })
})
