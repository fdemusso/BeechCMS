// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { SchemaQueryExecutor } from '@beechcms/core'
import { queryD1, type WranglerOptions } from './wrangler.js'

/**
 * Adapts the CLI's synchronous D1 path (local miniflare SQLite, or `wrangler d1 execute --json`)
 * to the executor `@beechcms/core`'s introspection primitive expects.
 *
 * `queryD1` stays untouched: it is a degree-17 hub shared with `init`, `db:migrate`, `db:reset`,
 * `onboard` and `generate-types`. This wrapper adds a Promise and nothing else — no caching, no
 * retry, no statement rewriting (see the `SchemaQueryExecutor` contract).
 */
export function createWranglerExecutor(options: WranglerOptions): SchemaQueryExecutor {
  return {
    all<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
      return Promise.resolve(queryD1<T>(sql, options))
    },
  }
}
