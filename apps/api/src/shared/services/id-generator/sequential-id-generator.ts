// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IIdGenerator } from '@beechcms/core'

const ID_PADDING_WIDTH = 4

// Matches the format emitted by uuid() → 'test-id-XXXX'
const TEST_ID_REGEX = /^test-id-\d{4}$/

/**
 * Test-only IIdGenerator implementation. Each call returns a stable,
 * monotonically increasing identifier (`test-id-0001`, `test-id-0002`, …)
 * so snapshot assertions and insert-order checks remain deterministic
 * across runs.
 */
export class SequentialIdGenerator implements IIdGenerator {
  private counter = 0

  uuid(): string {
    this.counter += 1
    return `test-id-${String(this.counter).padStart(ID_PADDING_WIDTH, '0')}`
  }

  isValid(value: unknown): value is string {
    return typeof value === 'string' && TEST_ID_REGEX.test(value)
  }

  reset(): void {
    this.counter = 0
  }
}
