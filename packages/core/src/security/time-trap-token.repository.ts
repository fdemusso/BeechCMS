// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface ITimeTrapTokenRepository {
  /** Cheap, non-atomic pre-check used only to fail fast before expensive validation. */
  isTokenUsed(tokenHash: string): Promise<boolean>
  /** Atomically claims a token hash as consumed. Returns false if it was already claimed. */
  claimToken(tokenHash: string, usedAt: number, expiresAt: number): Promise<boolean>
  /** Releases a previously claimed token hash, allowing retry after a failed content creation. */
  releaseToken(tokenHash: string): Promise<void>
  /** Cleans up expired token entries. */
  cleanup(nowSeconds: number): Promise<void>
}
