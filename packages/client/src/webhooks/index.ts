// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const BEECH_SIGNATURE_HEADER = 'x-beechcms-signature'
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300

const TIMESTAMP_KEY = 't'
const VERSION_KEY = 'v1'
const HEX_REGEX = /^[0-9a-fA-F]{64}$/
const INTEGER_REGEX = /^\d+$/

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
  /** Maximum allowed age (and future clock skew) in seconds. Defaults to 300 (5 minutes). Pass `null` to disable timestamp age enforcement. */
  toleranceSeconds?: number | null
  /** Current Unix timestamp in seconds (defaults to `Math.floor(Date.now() / 1000)`). */
  nowSeconds?: number
}

export interface ConstructWebhookEventOptions {
  payload: string
  signature: string | null | undefined
  secret: string
  /** Maximum allowed age (and future clock skew) in seconds. Defaults to 300 (5 minutes). Pass `null` to disable timestamp age enforcement. */
  toleranceSeconds?: number | null
  /** Current Unix timestamp in seconds (defaults to `Math.floor(Date.now() / 1000)`). */
  nowSeconds?: number
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeHmacSha256Hex(signedPayload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
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

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) return null

    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)

    if (key === TIMESTAMP_KEY) {
      if (!INTEGER_REGEX.test(value)) return null
      const parsed = Number.parseInt(value, 10)
      if (!Number.isSafeInteger(parsed)) return null
      if (timestamp !== null && timestamp !== parsed) return null
      timestamp = parsed
    } else if (key === VERSION_KEY) {
      if (!HEX_REGEX.test(value)) return null
      signatures.push(value.toLowerCase())
    }
  }

  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

/**
 * Validates an inbound BeechCMS webhook signature (`t=<unix_sec>,v1=<hex>`) in constant time
 * and enforces a replay tolerance window (300 seconds by default).
 * Returns `false` without throwing if the payload, signature, timestamp, or secret is invalid or expired.
 */
export async function verifyBeechWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
  try {
    if (!options || typeof options !== 'object') {
      return false
    }
    const { payload, signature, secret, toleranceSeconds, nowSeconds } = options
    if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
      return false
    }
    if (!secret.trim() || !signature.trim()) {
      return false
    }

    const parsed = parseSignatureHeader(signature)
    if (!parsed) {
      return false
    }

    const tolerance = toleranceSeconds === undefined ? DEFAULT_WEBHOOK_TOLERANCE_SECONDS : toleranceSeconds
    if (tolerance !== null) {
      if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
        return false
      }
      const now = nowSeconds ?? Math.floor(Date.now() / 1000)
      if (!Number.isFinite(now)) {
        return false
      }
      if (Math.abs(now - parsed.timestamp) > tolerance) {
        return false
      }
    }

    const expectedHex = await computeHmacSha256Hex(`${parsed.timestamp}.${payload}`, secret)
    let matched = false
    for (const candidate of parsed.signatures) {
      if (timingSafeEqual(expectedHex, candidate)) {
        matched = true
      }
    }
    return matched
  } catch {
    return false
  }
}

/**
 * Verifies the timestamped HMAC signature (`t=<unix_sec>,v1=<hex>`) and deserializes the JSON payload into type `T`.
 * Throws `WebhookVerificationError` on missing parameters, expired timestamps, or cryptographic signature failure.
 * Lets `SyntaxError` surface naturally if JSON parsing fails on a valid payload.
 */
export async function constructWebhookEvent<T = Record<string, unknown>>(
  options: ConstructWebhookEventOptions,
): Promise<T> {
  if (!options || typeof options !== 'object') {
    throw new WebhookVerificationError('Options object must be provided')
  }

  const { payload, signature, secret, toleranceSeconds, nowSeconds } = options

  if (typeof payload !== 'string' || !payload) {
    throw new WebhookVerificationError('Webhook payload must be a non-empty string')
  }
  if (typeof signature !== 'string' || !signature.trim()) {
    throw new WebhookVerificationError('Webhook signature is missing or empty')
  }
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new WebhookVerificationError('Webhook secret is missing or empty')
  }

  const isValid = await verifyBeechWebhookSignature({
    payload,
    signature,
    secret,
    toleranceSeconds,
    nowSeconds,
  })
  if (!isValid) {
    throw new WebhookVerificationError('Webhook signature verification failed')
  }

  return JSON.parse(payload) as T
}
