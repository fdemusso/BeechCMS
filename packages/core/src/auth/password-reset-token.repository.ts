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

export interface RedeemPasswordResetInput {
  tokenId: string
  userId: string
  newPasswordHash: string
  nowTimestamp: number
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

  /**
   * Redeems a token in one atomic unit: burns it, replaces the user's password hash and revokes
   * every refresh token. Either all three land or none do.
   * Returns `true` for the single caller that burned the token, `false` (writing nothing) when it
   * was already redeemed by a concurrent request.
   */
  redeem(input: RedeemPasswordResetInput): Promise<boolean>
}
