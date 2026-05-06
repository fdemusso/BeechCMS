import { describe, it, expect } from 'vitest'
import { generateRefreshToken } from './refresh'

describe('generateRefreshToken', () => {
  it('returns a non-empty string', () => {
    expect(generateRefreshToken().length).toBeGreaterThan(0)
  })

  it('returns a UUID-shaped value (8-4-4-4-12 hex groups)', () => {
    expect(generateRefreshToken()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('returns a different token on every call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateRefreshToken()))
    expect(tokens.size).toBe(10)
  })
})
