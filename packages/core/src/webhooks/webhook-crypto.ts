// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const VERSION_KEY = 'v1'
const TIMESTAMP_KEY = 't'
const HEX_REGEX = /^[0-9a-fA-F]{64}$/
const INTEGER_REGEX = /^\d+$/

/** Default maximum age (and future clock skew) accepted for signed webhooks, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300

export interface VerifyWebhookOptions {
  /** Maximum allowed age (and future clock skew) in seconds. Defaults to 300 (5 minutes). Pass `null` to disable timestamp age enforcement. */
  toleranceSeconds?: number | null
  /** Current Unix timestamp in seconds (defaults to `Math.floor(Date.now() / 1000)`). */
  nowSeconds?: number
}

export interface ParsedWebhookSignature {
  timestamp: number
  signatures: string[]
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function computeSignedHex(signedPayload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  return toHex(sig)
}

/**
 * Parses a Stripe-style `t=<unix_sec>,v1=<hex>` webhook signature header.
 * Returns `null` if the timestamp or `v1` signature is missing or malformed.
 */
export function parseWebhookSignatureHeader(header: string): ParsedWebhookSignature | null {
  if (!header || typeof header !== 'string') return null

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
 * Signs a raw request body with a Unix timestamp (seconds) in Stripe-style format:
 * `t=<unix_sec>,v1=<hex>` over `${timestamp}.${body}`.
 */
export async function signWebhookBody(
  body: string,
  secret: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new RangeError('Webhook signing timestamp must be a non-negative safe integer in seconds')
  }
  const hex = await computeSignedHex(`${timestampSeconds}.${body}`, secret)
  return `${TIMESTAMP_KEY}=${timestampSeconds},${VERSION_KEY}=${hex}`
}

/** Constant-time comparison of two equal-or-unequal-length strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Verifies an inbound Stripe-style webhook signature (`t=<unix_sec>,v1=<hex>`)
 * against `${timestamp}.${body}` and enforces a replay tolerance window (300s by default).
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  secret: string,
  options?: VerifyWebhookOptions,
): Promise<boolean> {
  if (typeof body !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
    return false
  }
  if (!signature.trim() || !secret.trim()) return false

  const parsed = parseWebhookSignatureHeader(signature)
  if (!parsed) return false

  const tolerance = options?.toleranceSeconds === undefined
    ? DEFAULT_WEBHOOK_TOLERANCE_SECONDS
    : options.toleranceSeconds

  if (tolerance !== null) {
    if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
      return false
    }
    const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (!Number.isFinite(now)) return false
    if (Math.abs(now - parsed.timestamp) > tolerance) {
      return false
    }
  }

  const expected = await computeSignedHex(`${parsed.timestamp}.${body}`, secret)
  let matched = false
  for (const candidate of parsed.signatures) {
    if (timingSafeEqual(expected, candidate)) {
      matched = true
    }
  }
  return matched
}
