// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface ConsentRecord {
  id: string
  clientId: string
  userId: string
  /** Cumulative set of scopes the user has approved for this client. */
  scopes: OAuthScope[]
  createdAt: number
  updatedAt: number
  revokedAt: number | null
}

export interface IOAuthConsentRepository {
  /** Returns the live consent for the pair, or null when absent or revoked. */
  findActive(clientId: string, userId: string): Promise<ConsentRecord | null>

  /**
   * Records consent for the pair, unioning `scopes` into any existing live grant
   * and reviving a previously revoked row. Idempotent for an unchanged scope set.
   */
  grant(
    id: string,
    clientId: string,
    userId: string,
    scopes: readonly OAuthScope[],
    nowTimestamp: number,
  ): Promise<void>

  /** Revokes the consent. False when there was nothing live to revoke. */
  revoke(clientId: string, userId: string, nowTimestamp: number): Promise<boolean>

  /** Lists all live consents for a user, newest first. */
  listForUser(userId: string): Promise<ConsentRecord[]>
}
