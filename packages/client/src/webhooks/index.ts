// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const BEECH_SIGNATURE_HEADER = 'x-beechcms-signature'

const SIG_PREFIX = 'sha256='
const HEX_REGEX = /^[0-9a-fA-F]{64}$/

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface VerifyWebhookSignatureOptions {
  payload: string
  signature: string | null | undefined
  secret: string
}

export interface ConstructWebhookEventOptions {
  payload: string
  signature: string | null | undefined
  secret: string
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeHmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Validates an inbound BeechCMS webhook signature against a shared secret in constant time.
 * Returns `false` without throwing if the payload, signature, or secret is invalid or mismatching.
 * Accepts both `sha256=<hex>` and raw `<hex>` formats.
 */
export async function verifyBeechWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
  try {
    if (!options || typeof options !== 'object') {
      return false
    }
    const { payload, signature, secret } = options
    if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
      return false
    }
    if (!secret.trim() || !signature.trim()) {
      return false
    }

    const cleanSig = signature.trim()
    const rawProvided = cleanSig.startsWith(SIG_PREFIX)
      ? cleanSig.slice(SIG_PREFIX.length)
      : cleanSig

    if (!HEX_REGEX.test(rawProvided)) {
      return false
    }

    const expectedHex = await computeHmacSha256Hex(payload, secret)
    return timingSafeEqual(expectedHex.toLowerCase(), rawProvided.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Verifies the HMAC signature and deserializes the JSON payload into type `T`.
 * Throws `WebhookVerificationError` on missing parameters or cryptographic signature failure.
 * Lets `SyntaxError` surface naturally if JSON parsing fails on a valid payload.
 */
export async function constructWebhookEvent<T = Record<string, unknown>>(
  options: ConstructWebhookEventOptions,
): Promise<T> {
  if (!options || typeof options !== 'object') {
    throw new WebhookVerificationError('Options object must be provided')
  }

  const { payload, signature, secret } = options

  if (typeof payload !== 'string' || !payload) {
    throw new WebhookVerificationError('Webhook payload must be a non-empty string')
  }
  if (typeof signature !== 'string' || !signature.trim()) {
    throw new WebhookVerificationError('Webhook signature is missing or empty')
  }
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new WebhookVerificationError('Webhook secret is missing or empty')
  }

  const isValid = await verifyBeechWebhookSignature({ payload, signature, secret })
  if (!isValid) {
    throw new WebhookVerificationError('Webhook signature verification failed')
  }

  return JSON.parse(payload) as T
}
