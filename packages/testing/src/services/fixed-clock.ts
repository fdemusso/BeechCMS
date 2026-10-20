// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IClock } from '@beechcms/core'

const MILLISECONDS_PER_SECOND = 1000

/** Frozen-time {@link IClock}. Advances only when a test tells it to. */
export class FixedClock implements IClock {
  private currentMs: number

  constructor(fixedNowMs: number) {
    this.currentMs = fixedNowMs
  }

  now(): number {
    return this.currentMs
  }

  nowSeconds(): number {
    return Math.floor(this.currentMs / MILLISECONDS_PER_SECOND)
  }

  /** Jumps to an absolute epoch-millisecond value. */
  set(nowMs: number): void {
    this.currentMs = nowMs
  }

  /** Moves time forward (or backward, with a negative delta) by `deltaMs`. */
  advance(deltaMs: number): void {
    this.currentMs += deltaMs
  }
}
