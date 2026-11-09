// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IDemoDataRepository, ContentRepository, Seed } from '@beechcms/core'
import { DEMO_FIXTURES_BY_SEED_SLUG } from '../fixtures/demo-data.fixtures'

const WEEK_SECONDS = 7 * 24 * 60 * 60

/**
 * A random creation time within the last week and a last-modified time between that and now, so the demo
 * reads as content written over the past days instead of everything created at the moment of the load.
 */
function randomTimestamps(nowSeconds: number): { created_at: number; updated_at: number } {
  const created = nowSeconds - Math.floor(Math.random() * WEEK_SECONDS)
  const updated = created + Math.floor(Math.random() * (nowSeconds - created + 1))
  return { created_at: created, updated_at: updated }
}

export class D1DemoDataRepository implements IDemoDataRepository {
  constructor(private readonly _db?: unknown) {}

  /**
   * Loads structured demo datasets using ContentRepository domain methods.
   * This guarantees full compliance with field validation, privacy encryption (AES-256-GCM),
   * blind index generation (*_bidx), FTS search indexing, and relation integrity.
   */
  async loadDemoData(
    repository: ContentRepository,
    getSeed: (slug: string) => Seed | null
  ): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000)
    for (const [slug, fixtures] of Object.entries(DEMO_FIXTURES_BY_SEED_SLUG)) {
      const seed = getSeed(slug)
      if (!seed) {
        throw new Error(`Feature not implemented: demo seed '${slug}' is not registered in runtime seed registry.`)
      }

      for (const entry of fixtures) {
        try {
          await repository.create(seed, entry.id, entry.slug, entry.status, { ...randomTimestamps(nowSeconds), ...entry.data })
        } catch (err) {
          // Idempotent: ignore if entry with this ID/slug already exists
          console.warn(`[demo-data] Failed to insert fixture entry ${entry.id} for seed '${slug}':`, err)
        }
      }
    }
  }
}
