// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export class NoOpRateLimiter implements IRateLimiter {
  async checkLimit(_key: string): Promise<RateLimitResult> {
    return { isAllowed: true }
  }
}
