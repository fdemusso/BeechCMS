// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { verifyQStashSignature } from './qstash-signature'

const ENDPOINT = 'https://beechcms.test/api/webhooks/qstash'
const BODY = '{"title":"t","message":"m"}'
const CURRENT = 'current-signing-key'
const NEXT = 'next-signing-key'
const encoder = new TextEncoder()

async function bodyHash(body: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body)))
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(
  key: string,
  overrides: { issuer?: string; subject?: string; expiresIn?: string | number } = {},
): Promise<string> {
  return new SignJWT({ body: await bodyHash(BODY) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(overrides.issuer ?? 'Upstash')
    .setSubject(overrides.subject ?? ENDPOINT)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '5m')
    .sign(encoder.encode(key))
}

const verify = (signature: string, body = BODY) =>
  verifyQStashSignature({
    signature,
    body,
    url: ENDPOINT,
    currentSigningKey: CURRENT,
    nextSigningKey: NEXT,
  })

describe('verifyQStashSignature', () => {
  it('accepts a delivery signed with the current key', async () => {
    await expect(verify(await sign(CURRENT))).resolves.toBeUndefined()
  })

  it('accepts a delivery signed with the next key (key rotation)', async () => {
    await expect(verify(await sign(NEXT))).resolves.toBeUndefined()
  })

  it('rejects a delivery signed with an unknown key', async () => {
    await expect(verify(await sign('some-other-key'))).rejects.toThrow()
  })

  it('rejects a tampered body', async () => {
    await expect(verify(await sign(CURRENT), '{"title":"evil","message":"m"}')).rejects.toThrow('body hash')
  })

  it('rejects a signature issued for a different endpoint (cross-endpoint replay)', async () => {
    const signature = await sign(CURRENT, { subject: 'https://beechcms.test/api/other' })
    await expect(verify(signature)).rejects.toThrow('invalid subject')
  })

  it('rejects an expired signature', async () => {
    const signature = await sign(CURRENT, { expiresIn: Math.floor(Date.now() / 1000) - 60 })
    await expect(verify(signature)).rejects.toThrow()
  })

  it('rejects a signature with the wrong issuer', async () => {
    await expect(verify(await sign(CURRENT, { issuer: 'Mallory' }))).rejects.toThrow()
  })

  it('rejects an unsigned (alg none) token', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '')
    const claims = btoa(
      JSON.stringify({ iss: 'Upstash', sub: ENDPOINT, body: await bodyHash(BODY), exp: 9999999999 }),
    ).replace(/=+$/, '')
    await expect(verify(`${header}.${claims}.`)).rejects.toThrow()
  })

  it('rejects a token that is not a JWT', async () => {
    await expect(verify('not-a-jwt')).rejects.toThrow()
  })
})
