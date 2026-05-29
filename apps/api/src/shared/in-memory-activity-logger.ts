// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IActivityLogger, ActivityLogEntry } from '@beechcms/core'

/**
 * Test double for {@link IActivityLogger}.
 *
 * Captures every call into a public array so test assertions can verify
 * audit-trail side effects without touching D1. Preserves insertion order.
 */
export class InMemoryActivityLogger implements IActivityLogger {
  public readonly entries: ActivityLogEntry[] = []

  log(entry: ActivityLogEntry): void {
    this.entries.push(entry)
  }
}
