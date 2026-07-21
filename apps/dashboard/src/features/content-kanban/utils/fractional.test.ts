// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { positionBetween, rebalanceKeys } from './fractional'

describe('positionBetween', () => {
  it('returns a non-empty string for (null, null)', () => {
    const key = positionBetween(null, null)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('produces strictly ascending keys when repeatedly called with the previous result as before', () => {
    let prev = positionBetween(null, null)
    for (let i = 0; i < 5; i++) {
      const next = positionBetween(prev, null)
      expect(next > prev).toBe(true)
      prev = next
    }
  })

  it('returns a key b such that a < b < c for positionBetween(a, c) where a < c', () => {
    const a = positionBetween(null, null)
    const c = positionBetween(a, null)
    const b = positionBetween(a, c)
    expect(a < b).toBe(true)
    expect(b < c).toBe(true)
  })
})

describe('rebalanceKeys', () => {
  it('returns exactly n keys, strictly ascending, with no duplicates', () => {
    const keys = rebalanceKeys(5)
    expect(keys).toHaveLength(5)
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true)
    }
    expect(new Set(keys).size).toBe(5)
  })
})
