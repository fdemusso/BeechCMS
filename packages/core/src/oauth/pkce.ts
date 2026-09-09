// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * PKCE (RFC 7636) verification. `S256` only — `plain` is rejected unconditionally,
 * per OAuth 2.1, so no weak fallback configuration can ever exist.
 */

/** The only accepted code challenge method. */
export const PKCE_CHALLENGE_METHOD = 'S256' as const

export type PkceChallengeMethod = typeof PKCE_CHALLENGE_METHOD

/** Minimum / maximum code_verifier length, RFC 7636 §4.1. */
export const PKCE_VERIFIER_MIN_LENGTH = 43
export const PKCE_VERIFIER_MAX_LENGTH = 128

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/

/** Validates the code_verifier character set and length. */
export function isValidCodeVerifier(verifier: string): boolean {
  return (
    verifier.length >= PKCE_VERIFIER_MIN_LENGTH &&
    verifier.length <= PKCE_VERIFIER_MAX_LENGTH &&
    VERIFIER_PATTERN.test(verifier)
  )
}

/** Base64url-encodes bytes without padding, per RFC 7636 §A. */
function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Computes BASE64URL(SHA256(ASCII(verifier))). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

/**
 * Verifies a code_verifier against a stored code_challenge.
 * Returns false — never throws — on any malformed input, unsupported method, or
 * mismatch, so callers cannot distinguish failure modes from the return value.
 */
export async function verifyPkceChallenge(
  verifier: string,
  challenge: string,
  method: string,
): Promise<boolean> {
  if (method !== PKCE_CHALLENGE_METHOD) return false
  if (!isValidCodeVerifier(verifier)) return false
  const derived = await deriveCodeChallenge(verifier)
  if (derived.length !== challenge.length) return false
  let mismatch = 0
  for (let index = 0; index < derived.length; index += 1) {
    mismatch |= derived.charCodeAt(index) ^ challenge.charCodeAt(index)
  }
  return mismatch === 0
}
