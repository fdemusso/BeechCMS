import { describe, it, expect } from 'vitest'
import { generateRefreshToken } from './refresh'

describe('generateRefreshToken', () => {
  it('returns a non-empty string', () => {
    expect(generateRefreshToken().length).toBeGreaterThan(0)
  })

  it('returns a 64-character hex string (256-bit / 32 bytes of entropy)', () => {
    const token = generateRefreshToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('returns a different token on every call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateRefreshToken()))
    expect(tokens.size).toBe(10)
  })
})
