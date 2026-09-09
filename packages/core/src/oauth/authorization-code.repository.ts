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
   * Returns the code regardless of its consumed state, provided it is unexpired.
   * Callers MUST inspect `consumedAt`: a non-null value means replay, which
   * requires cascade revocation via IOAuthTokenRepository.revokeByAuthorizationCode.
   */
  findByHash(codeHash: string, nowTimestamp: number): Promise<AuthorizationCodeRecord | null>

  /**
   * Atomically marks the code consumed. Returns true only for the first caller;
   * every subsequent call returns false, which is the replay signal.
   */
  consumeByHash(codeHash: string, nowTimestamp: number): Promise<boolean>
}
