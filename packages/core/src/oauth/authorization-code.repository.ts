// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface NewAuthorizationCode {
  /** SHA-256 hex hash of the code. The plaintext code is never persisted. */
  codeHash: string
  clientId: string
  userId: string
  scope: OAuthScope[]
  redirectUri: string
  codeChallenge: string
  /** Always 'S256'; the column CHECK constraint rejects anything else. */
  codeChallengeMethod: 'S256'
  expiresAt: number
}

export interface AuthorizationCodeRecord extends NewAuthorizationCode {
  createdAt: number
  consumedAt: number | null
}

export interface IOAuthAuthorizationCodeRepository {
  /** Persists a new single-use authorization code. Hash only, never plaintext. */
  save(record: NewAuthorizationCode): Promise<void>

  /**
   * Returns the code regardless of its consumed OR expired state — replay must be
   * detectable even after the 60s TTL, since tokens derived from the code outlive it
   * by 30 days. Callers MUST inspect `consumedAt` (replay signal, requires cascade
   * revocation via IOAuthTokenRepository.revokeByAuthorizationCode) and `expiresAt`
   * separately (an unconsumed-but-expired code is simply invalid, nothing to revoke).
   */
  findByHash(codeHash: string): Promise<AuthorizationCodeRecord | null>

  /**
   * Atomically marks the code consumed. Returns true only for the first caller;
   * every subsequent call returns false, which is the replay signal. Expiry is
   * enforced here — redemption, unlike replay detection, must respect the TTL.
   */
  consumeByHash(codeHash: string, nowTimestamp: number): Promise<boolean>

  /** Invalidates every unconsumed code issued to a (client, user) pair, e.g. on consent revoke. */
  invalidateByClientAndUser(clientId: string, userId: string): Promise<number>
}
