// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IDemoDataRepository, ContentRepository, Seed } from '@beechcms/core'
import { DEMO_FIXTURES_BY_SEED_SLUG } from '../fixtures/demo-data.fixtures'

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
    for (const [slug, fixtures] of Object.entries(DEMO_FIXTURES_BY_SEED_SLUG)) {
      const seed = getSeed(slug)
      if (!seed) continue

      for (const entry of fixtures) {
        try {
          await repository.create(seed, entry.id, entry.slug, entry.status, entry.data)
        } catch {
          // Idempotent: ignore if entry with this ID/slug already exists
        }
      }
    }
  }
}
