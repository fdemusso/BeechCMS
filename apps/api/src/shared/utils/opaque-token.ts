// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />

/**
 * 256 bits of CSPRNG entropy, hex-encoded.
 *
 * The single entropy source for every bearer credential in the API: dashboard
 * session refresh tokens, OAuth authorization codes, and OAuth access/refresh
 * tokens. It lives in `shared/utils` — not inside `auth/` and not copied into a
 * feature slice — so that changing the length or the encoding is a one-line
 * change that cannot silently leave a second copy behind.
 *
 * Promoted from `auth/utils/refresh-token.ts` (`generateRefreshToken`) in the
 * `oauth-authorization-server` sprint. Body is unchanged.
 */
export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
