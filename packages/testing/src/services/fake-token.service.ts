// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IClock, ITokenService, IssueTokenOptions, JwtClaims } from '@beechcms/core'

export const TEST_TOKEN_PREFIX = 'test:'

const DEFAULT_TOKEN_TTL_SECONDS = 900

interface IssuedToken {
  readonly claims: JwtClaims
  readonly expiresAtSeconds: number
}

/**
 * Non-cryptographic {@link ITokenService} for the integration tier. Tokens are opaque
 * handles into an in-memory map, never signed — so this class can never be used to assert
 * anything about real JWT signing. That surface is covered by
 * `apps/api/src/auth/providers/jwt-token.service.test.ts` instead.
 */
export class FakeTokenService implements ITokenService {
  private readonly issued = new Map<string, IssuedToken>()
  private counter = 0

  constructor(private readonly clock: IClock) {}

  async issue(claims: JwtClaims, options?: IssueTokenOptions): Promise<string> {
    const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
    // The counter keeps two tokens for the same subject distinguishable (refresh/rotation cases).
    const token = `${TEST_TOKEN_PREFIX}${claims.sub}:${this.counter++}`
    this.issued.set(token, {
      claims,
      expiresAtSeconds: this.clock.nowSeconds() + ttlSeconds,
    })
    return token
  }

  async verify(token: string): Promise<JwtClaims | null> {
    if (!token.startsWith(TEST_TOKEN_PREFIX)) return null
    const entry = this.issued.get(token)
    if (!entry) return null
    if (this.clock.nowSeconds() >= entry.expiresAtSeconds) return null
    return entry.claims
  }

  /** Test affordance: forget a token without advancing the clock (revocation cases). */
  revoke(token: string): void {
    this.issued.delete(token)
  }
}
