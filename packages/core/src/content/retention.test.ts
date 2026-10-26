// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { isValidRetentionDays, resolveRetentionDays } from './retention.js'

describe('isValidRetentionDays', () => {
  it('accepts integers from 0 to 36500 and rejects everything else', () => {
    const accepted = [0, 1, 14, 36500]
    const rejected = [-1, 1.5, NaN, Infinity, 36501, '14', null, undefined]

    expect(accepted.map(isValidRetentionDays)).toEqual(accepted.map(() => true))
    expect(rejected.map(isValidRetentionDays)).toEqual(rejected.map(() => false))
  })
})

describe('resolveRetentionDays', () => {
  it('returns the global value for a seed with no retentionDays', () => {
    const effective = resolveRetentionDays({}, 14)

    expect(effective).toBe(14)
  })

  it("returns the seed's retentionDays over the global value", () => {
    const effective = resolveRetentionDays({ retentionDays: 30 }, 14)

    expect(effective).toBe(30)
  })

  it('keeps a seed retentionDays of 0 even when the global value is 14', () => {
    const effective = resolveRetentionDays({ retentionDays: 0 }, 14)

    expect(effective).toBe(0)
  })

  it('reads a null retentionDays as absent and returns the global value', () => {
    // Canonical JSON can carry null for an unset optional field.
    const effective = resolveRetentionDays({ retentionDays: null as unknown as undefined }, 14)

    expect(effective).toBe(14)
  })

  it('returns 0 when the global value is 0 and the seed has no override', () => {
    const effective = resolveRetentionDays({}, 0)

    expect(effective).toBe(0)
  })
})
