// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { jwtVerify } from 'jose'

export interface QStashSignatureInput {
  /** Value of the `Upstash-Signature` header (an HS256 JWT). */
  signature: string
  /** Raw request body, exactly as received. */
  body: string
  /** URL QStash delivered to; must equal the JWT `sub` claim (endpoint binding). */
  url: string
  currentSigningKey: string
  nextSigningKey: string
}

const encoder = new TextEncoder()

async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verifies a QStash delivery: HS256 JWT signed with the current signing key, falling back to the
 * next key during rotation, issued by `Upstash`, bound to this endpoint URL and to the SHA-256 of the body.
 *
 * @throws {Error} When the signature, issuer, expiry, URL binding or body hash does not match.
 */
export async function verifyQStashSignature(input: QStashSignatureInput): Promise<void> {
  const verifyWithKey = (key: string) =>
    jwtVerify(input.signature, encoder.encode(key), { issuer: 'Upstash', algorithms: ['HS256'] })

  let payload
  try {
    ;({ payload } = await verifyWithKey(input.currentSigningKey))
  } catch {
    ;({ payload } = await verifyWithKey(input.nextSigningKey))
  }

  if (payload.sub !== input.url) {
    throw new Error(`invalid subject: ${payload.sub}, want: ${input.url}`)
  }
  const bodyClaim = typeof payload.body === 'string' ? payload.body.replace(/=+$/, '') : undefined
  if (bodyClaim !== (await sha256Base64Url(input.body))) {
    throw new Error('body hash does not match')
  }
}
