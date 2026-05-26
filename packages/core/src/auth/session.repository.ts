// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface NewRefreshToken {
  id: string
  userId: string
  tokenHash: string
  expiresAt: number
}

export interface RefreshTokenRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: number
  createdAt: number
  revokedAt: number | null
}

export interface ActiveSessionSummary {
  id: string
  createdAt: number
  expiresAt: number
}

export interface ISessionRepository {
  /** Stores a new refresh token record. Only the hash is persisted, never the plaintext. */
  saveRefreshToken(record: NewRefreshToken): Promise<void>

  /**
   * Finds an active refresh token by its hash.
   * nowTimestamp is compared against expiresAt and revokedAt to guarantee the token
   * is both unexpired and not revoked before returning it.
   */
  findActiveByHash(tokenHash: string, nowTimestamp: number): Promise<RefreshTokenRecord | null>

  /**
   * Marks a refresh token as revoked so it cannot be used again.
   * Returns true if the token was found and revoked, false if it was already revoked or absent.
   */
  revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean>

  /**
   * Revokes all active refresh tokens for a user.
   * Must be called on password change to invalidate all existing sessions immediately.
   */
  revokeAllForUser(userId: string, nowTimestamp: number): Promise<void>

  /** Returns a paginated list of active sessions for the user, ordered newest first. */
  listActiveForUser(userId: string, nowTimestamp: number, limit: number): Promise<ActiveSessionSummary[]>

  /**
   * Revokes a specific session by its database ID, scoped to the owning user
   * to prevent one user from revoking another user's sessions.
   */
  revokeById(sessionId: string, userId: string, nowTimestamp: number): Promise<boolean>
}
