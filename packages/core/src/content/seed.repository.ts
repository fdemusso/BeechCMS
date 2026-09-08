// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

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
  /** Applies additive DDL, the definition upsert and the registry-version bump as ONE
   *  transactional batch, guarded by compare-and-swap on seed_meta.registry_version.
   *  All-or-nothing: a guard mismatch or a failing statement writes nothing.
   *  The DDL strings MUST come from the core planners — this method never generates SQL. */
  applyAtomic(input: SeedApplyInput): Promise<SeedApplyResult>
}

/** Input for an atomic, OCC-guarded schema apply. */
export interface SeedApplyInput {
  slug: string
  /** Full canonical definition to store in `seeds.definition`. */
  definition: Seed
  /** Additive DDL produced by planCreateSeed / planExtendSeed. Never destructive. */
  ddl: string[]
  /** The registry_version the caller planned against (compare-and-swap guard). */
  expectedVersion: number
  source?: 'code' | 'runtime'
}

export interface SeedApplyResult {
  /** false when the CAS guard did not match — nothing was written. */
  applied: boolean
  /** The version now in D1: expectedVersion + 1 on success, the live value on conflict. */
  version: number
}
