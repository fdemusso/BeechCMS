// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from './types.js'

export interface SeedRecord {
  slug: string
  definition: Seed
  status: 'active' | 'deleted'
  source: 'code' | 'runtime'
  createdAt: number
  updatedAt: number
}

/**
 * Persistence contract for runtime Seed definitions.
 * Implemented by D1SeedRepository in apps/api/src/shared/seed.repository.d1.ts.
 *
 * `listActive()` returns only status='active' rows — this is what the registry is
 * hydrated from. `getRegistryVersion` / `bumpRegistryVersion` back the multi-isolate
 * cache token (see docs/Sprints/runtime-seeds/00-overview.md).
 */
export interface ISeedRepository {
  /** All active seed definitions, ordered by created_at ASC. */
  listActive(): Promise<Seed[]>
  /** Every row including soft-deleted ones (for admin/diff use). */
  listAll(): Promise<SeedRecord[]>
  /** Single active-or-deleted record by slug, or null. */
  get(slug: string): Promise<SeedRecord | null>
  /** Insert or replace a definition. Sets source on insert; preserves it on update unless given. */
  upsert(slug: string, definition: Seed, source?: 'code' | 'runtime'): Promise<void>
  /** Soft-delete: set status='deleted'. Table is NOT dropped (additive-only). */
  softDelete(slug: string): Promise<void>
  /** Hard-delete (sprint 06): permanently remove the `seeds` row. The caller is
   *  responsible for dropping the backing tables first via ISchemaMutator. */
  hardDelete(slug: string): Promise<void>
  /** Current cache token. */
  getRegistryVersion(): Promise<number>
  /** Atomically increment and return the new token. Call after any write. */
  bumpRegistryVersion(): Promise<number>
}
