// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { SystemClock } from '@beechcms/core'
import { JoseTokenService } from './jose-token-service'
import { StaticTokenService } from './__fixtures__/static-token-service'

const TEST_SECRET = 'super-secret-key-used-only-in-the-vitest-suite-min-length'

describe('JoseTokenService', () => {
  const service = new JoseTokenService(TEST_SECRET, {}, SystemClock)

  it('issue returns a three-part JWT string', async () => {
    const token = await service.issue({ sub: 'user-1', email: 'a@b.com' })
    expect(token.split('.')).toHaveLength(3)
  })

  it('verify returns the original claims for a valid token', async () => {
    const token = await service.issue({ sub: 'user-1', email: 'a@b.com' })
    const claims = await service.verify(token)
    expect(claims?.sub).toBe('user-1')
    expect(claims?.email).toBe('a@b.com')
  })

  it('verify returns null for a malformed token', async () => {
    expect(await service.verify('not.a.valid.jwt')).toBeNull()
  })

  it('verify returns null for a token signed with a different secret', async () => {
    const otherService = new JoseTokenService('completely-different-secret-key-xyz', {}, SystemClock)
    const token = await otherService.issue({ sub: 'user-1' })
    expect(await service.verify(token)).toBeNull()
  })

  it('verify returns null for an expired token (ttlSeconds = -1)', async () => {
    const token = await service.issue({ sub: 'user-1' }, { ttlSeconds: -1 })
    expect(await service.verify(token)).toBeNull()
  })

  it('issuer mismatch causes verify to return null', async () => {
    const issuerA = new JoseTokenService(TEST_SECRET, { issuer: 'issuer-a' }, SystemClock)
    const issuerB = new JoseTokenService(TEST_SECRET, { issuer: 'issuer-b' }, SystemClock)
    const token = await issuerA.issue({ sub: 'user-1' })
    expect(await issuerB.verify(token)).toBeNull()
  })

  it('custom TTL is respected — token issued with longer TTL verifies successfully', async () => {
    const token = await service.issue({ sub: 'user-1' }, { ttlSeconds: 3600 })
    const claims = await service.verify(token)
    expect(claims?.sub).toBe('user-1')
  })

  it('throws if the secret is shorter than 32 bytes', () => {
    expect(() => new JoseTokenService('short-secret', {}, SystemClock)).toThrow('JWT secret must be at least 32 bytes')
  })
})

describe('StaticTokenService', () => {
  it('issue returns "test:" + claims.sub', async () => {
    const service = new StaticTokenService()
    expect(await service.issue({ sub: 'abc' })).toBe('test:abc')
  })

  it('verify returns the stored claims for an issued token', async () => {
    const service = new StaticTokenService()
    await service.issue({ sub: 'abc', email: 'x@y.com' })
    const claims = await service.verify('test:abc')
    expect(claims?.email).toBe('x@y.com')
    expect(claims?.sub).toBe('abc')
  })

  it('verify returns null for an unknown test sub', async () => {
    const service = new StaticTokenService()
    expect(await service.verify('test:unknown')).toBeNull()
  })

  it('verify returns null for a token that does not start with "test:"', async () => {
    const service = new StaticTokenService()
    expect(await service.verify('real.jwt.token')).toBeNull()
  })

  it('each StaticTokenService instance has its own isolated claims store', async () => {
    const serviceA = new StaticTokenService()
    const serviceB = new StaticTokenService()
    await serviceA.issue({ sub: 'user-1' })
    expect(await serviceB.verify('test:user-1')).toBeNull()
  })
})
