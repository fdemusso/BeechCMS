// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const SIG_PREFIX = 'sha256='

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

/** Signs a raw request body. Returns `sha256=<hex>`. */
export async function signWebhookBody(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return SIG_PREFIX + toHex(sig)
}

/** Constant-time comparison of two equal-or-unequal-length strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Verifies an inbound signature against the recomputed HMAC.
 * Accepts the `sha256=` prefix on the provided signature (optional).
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false
  const expected = await signWebhookBody(body, secret)
  const provided = signature.startsWith(SIG_PREFIX) ? signature : SIG_PREFIX + signature
  return timingSafeEqual(expected, provided)
}
