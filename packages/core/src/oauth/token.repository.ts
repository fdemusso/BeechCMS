// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export type OAuthTokenType = 'access' | 'refresh'

export interface NewOAuthToken {
  id: string
  /** SHA-256 hex hash of the token. The plaintext token is never persisted. */
  tokenHash: string
  tokenType: OAuthTokenType
  clientId: string
  userId: string
  scope: OAuthScope[]
  /** Hash of the authorization code this token descends from, for cascade revocation. */
  authorizationCodeHash: string
  expiresAt: number
}

export interface OAuthTokenRecord extends NewOAuthToken {
  createdAt: number
  revokedAt: number | null
}

export interface AuthorizedClientSummary {
  clientId: string
  clientName: string
  scope: OAuthScope[]
  /** Creation timestamp of the most recent live token for this client. */
  lastIssuedAt: number
}

export interface IOAuthTokenRepository {
  save(record: NewOAuthToken): Promise<void>

  /** Finds an unexpired, unrevoked token by hash and type. */
  findActiveByHash(
    tokenHash: string,
    tokenType: OAuthTokenType,
    nowTimestamp: number,
  ): Promise<OAuthTokenRecord | null>

  /** Revokes a single token. False when already revoked or absent. */
  revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean>

  /**
   * Revokes EVERY token descending from one authorization code, both access and
   * refresh. Called on authorization-code replay (OAuth 2.1 §4.1.3).
   * Returns the number of tokens revoked.
   */
  revokeByAuthorizationCode(authorizationCodeHash: string, nowTimestamp: number): Promise<number>

  /**
   * Revokes every live token for one (client, user) pair — access AND refresh,
   * never one without the other. Backs "revoke this app" in the dashboard.
   */
  revokeAllForClientAndUser(clientId: string, userId: string, nowTimestamp: number): Promise<number>

  /** Lists the clients holding at least one live token for this user, newest first. */
  listAuthorizedClientsForUser(userId: string, nowTimestamp: number): Promise<AuthorizedClientSummary[]>
}
