// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface ITimeTrapTokenRepository {
  /** Checks if a time-trap token hash has already been consumed. */
  isTokenUsed(tokenHash: string): Promise<boolean>
  /** Marks a time-trap token hash as consumed with an expiration timestamp. */
  markTokenUsed(tokenHash: string, usedAt: number, expiresAt: number): Promise<void>
  /** Cleans up expired token entries. */
  cleanup(nowSeconds: number): Promise<void>
}
