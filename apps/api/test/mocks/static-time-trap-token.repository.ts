// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { ITimeTrapTokenRepository } from '@beechcms/core'

export class StaticTimeTrapTokenRepository implements ITimeTrapTokenRepository {
  private usedTokens = new Set<string>()

  async isTokenUsed(tokenHash: string): Promise<boolean> {
    return this.usedTokens.has(tokenHash)
  }

  async markTokenUsed(tokenHash: string, _usedAt: number, _expiresAt: number): Promise<void> {
    this.usedTokens.add(tokenHash)
  }

  async cleanup(_nowSeconds: number): Promise<void> {
    // No-op for mock
  }

  reset(): void {
    this.usedTokens.clear()
  }
}
