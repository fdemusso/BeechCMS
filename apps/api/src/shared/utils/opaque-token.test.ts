// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { generateOpaqueToken } from './opaque-token'

describe('generateOpaqueToken', () => {
  it('returns a non-empty string', () => {
    expect(generateOpaqueToken().length).toBeGreaterThan(0)
  })

  it('returns a 64-character hex string (256-bit / 32 bytes of entropy)', () => {
    const token = generateOpaqueToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('returns a different token on every call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateOpaqueToken()))
    expect(tokens.size).toBe(10)
  })
})
