// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface NewPasswordResetToken {
  userId: string
  tokenHash: string
  expiresAt: number
}

export interface ValidatedResetToken {
  id: string
  userId: string
  email: string
}

export interface IPasswordResetTokenRepository {
  /**
   * Marks all pending (unused) tokens for the user as consumed before issuing a new one.
   * Ensures only one active reset token exists per user at any time.
   */
  invalidatePending(userId: string, nowTimestamp: number): Promise<void>

  /** Stores a new password reset token. Only the hash is persisted, never the plaintext. */
  create(record: NewPasswordResetToken): Promise<void>

  /**
   * Finds a valid reset token by its hash, joining the users table to return the
   * associated email in the same query to avoid a second round-trip.
   * Returns null if the token is expired, already used, or not found.
   */
  findValidByHashWithEmail(tokenHash: string, nowTimestamp: number): Promise<ValidatedResetToken | null>

  /** Marks a token as consumed so it cannot be used again. */
  markUsed(tokenId: string, nowTimestamp: number): Promise<void>
}
