import { describe, it, expect } from 'vitest'
import { InMemoryHashProvider } from './in-memory-hash-provider'
import { BcryptHashProvider } from './bcrypt-hash-provider'

describe('InMemoryHashProvider', () => {
  const provider = new InMemoryHashProvider()

  it('hash returns the HASH: prefix concatenated with the plaintext', async () => {
    expect(await provider.hash('mypassword')).toBe('HASH:mypassword')
  })

  it('verify returns true when the plaintext matches the stored hash', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('correct', hash)).toBe(true)
  })

  it('verify returns false when the plaintext does not match', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('wrong', hash)).toBe(false)
  })

  it('verify returns false for a string that does not follow the HASH: format', async () => {
    expect(await provider.verify('anything', 'not-a-prefixed-hash')).toBe(false)
  })
})

describe('BcryptHashProvider', () => {
  // Use 4 salt rounds so the test runs in milliseconds.
  const provider = new BcryptHashProvider(4)

  it('hash and verify roundtrip: correct password returns true', async () => {
    const hash = await provider.hash('secure-password')
    expect(await provider.verify('secure-password', hash)).toBe(true)
  })

  it('verify returns false for an incorrect password', async () => {
    const hash = await provider.hash('correct')
    expect(await provider.verify('incorrect', hash)).toBe(false)
  })

  it('verify returns false against the DUMMY_PASSWORD_HASH for any plaintext', async () => {
    // The dummy hash is used for timing-attack mitigation; it must not match real passwords.
    const dummyHash = '$2a$10$SbkRFOafACxVM2ahxerVDu3tSkCXWm29b62WdB.4WGG02Qjsfzni6'
    expect(await provider.verify('password123', dummyHash)).toBe(false)
  })
})
