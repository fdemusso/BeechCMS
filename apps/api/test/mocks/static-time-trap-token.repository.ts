// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { ITimeTrapTokenRepository } from '@beechcms/core'

export class StaticTimeTrapTokenRepository implements ITimeTrapTokenRepository {
  private usedTokens = new Set<string>()

  async isTokenUsed(tokenHash: string): Promise<boolean> {
    return this.usedTokens.has(tokenHash)
  }

  async claimToken(tokenHash: string, _usedAt: number, _expiresAt: number): Promise<boolean> {
    if (this.usedTokens.has(tokenHash)) return false
    this.usedTokens.add(tokenHash)
    return true
  }

  async releaseToken(tokenHash: string): Promise<void> {
    this.usedTokens.delete(tokenHash)
  }

  async cleanup(_nowSeconds: number): Promise<void> {
    // No-op for mock
  }

  reset(): void {
    this.usedTokens.clear()
  }
}
