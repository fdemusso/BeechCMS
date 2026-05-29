// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IDemoDataRepository } from '@beechcms/core'
import { DEMO_DATA_SQL } from './demo-data-sql'

export class D1DemoDataRepository implements IDemoDataRepository {
  constructor(private readonly db: D1Database) {}

  async loadDemoData(): Promise<void> {
    const statements = DEMO_DATA_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => this.db.prepare(s))
    await this.db.batch(statements)
  }
}
