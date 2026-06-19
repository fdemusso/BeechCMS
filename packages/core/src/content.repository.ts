// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { Seed, SelectOptions } from './types.js'

/**
 * One row of the cross-seed pending-drafts overview. Aggregates the minimum a
 * reviewer needs to triage a draft without opening it: which seed it belongs to,
 * a human title, when it was last touched, and who touched it.
 */
export interface DraftSummary {
  id: string
  seedSlug: string
  seedLabel: string
  title: string
  updatedAt: number
  lastModifiedBy: {
    name: string | null
    email: string
  }
}

/**
 * Base Repository Error
 */
export class RepositoryError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'RepositoryError'
  }
}

/**
 * Thrown when an entry is not found by ID or Slug
 */
export class EntryNotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message)
    this.name = 'EntryNotFoundError'
  }
}

/**
 * Thrown when a slug already exists for a content type
 */
export class SlugConflictError extends RepositoryError {
  constructor(message: string) {
    super(message)
    this.name = 'SlugConflictError'
  }
}

/**
 * Thrown by publishDraft when a non-null relation value points to a missing
 * target row. Mapped to 422 Unprocessable Entity by the API problem-mapper.
 */
export class RelationTargetNotFoundError extends RepositoryError {
  readonly alias: string
  readonly targetSeed: string
  readonly value: string

  constructor(params: { alias: string; targetSeed: string; value: string }) {
    super(
      `Relation target not found: field '${params.alias}' references '${params.targetSeed}' id='${params.value}' which does not exist`,
    )
    this.name = 'RelationTargetNotFoundError'
    this.alias = params.alias
    this.targetSeed = params.targetSeed
    this.value = params.value
  }
}

/**
 * Thrown by lifecycle `before*` hooks to signal a business validation failure.
 * Mapped to 422 Unprocessable Entity by the API problem-mapper.
 */
export class HookValidationError extends RepositoryError {
  readonly fields?: Array<{ field: string; message: string }>

  constructor(message: string, fields?: Array<{ field: string; message: string }>) {
    super(message)
    this.name = 'HookValidationError'
    this.fields = fields
  }
}

export type BulkFieldUpdate =
  | { kind: 'set'; value: unknown }
  | { kind: 'array_replace'; value: string[] }
  | { kind: 'array_add'; value: string[] }
  | { kind: 'array_remove'; value: string[] }

/**
 * Options passed to write operations. Currently carries the acting user
 * (extracted from the JWT) so lifecycle hooks can attribute changes.
 */
export interface RepositoryOptions {
  actor?: { id: string; role?: string; email?: string }
}

/**
 * Declarative multi-write operation translated into a single `db.batch` call.
 * Used for coordinated writes across one or more seeds when D1's lack of
 * interactive transactions makes a callback-based API impossible.
 *
 * NOTE: document-level lifecycle hooks do NOT run for operations inside a
 * `runBatch` call — they would be non-atomic side-effects.
 */
export type BatchWrite =
  | { kind: 'create'; seed: Seed; id: string; slug: string; status: string; data: Record<string, any> }
  | { kind: 'update'; seed: Seed; id: string; data: Record<string, any>; status?: string }
  | { kind: 'mutateField'; seed: Seed; id: string; fieldName: string; operation: { type: 'increment' | 'decrement'; value: number }; options?: { min?: number; max?: number } }

/**
 * Interface defining the standard operations for content persistence.
 * This is platform-agnostic and should be implemented for specific databases (e.g., D1).
 */
export interface ContentRepository {
  /**
   * Retrieves a paginated and filtered list of entries.
   */
  findMany(seed: Seed, options: SelectOptions): Promise<{ items: Record<string, any>[], total: number }>

  /**
   * Finds a single entry by its unique ID.
   * Throws EntryNotFoundError if not found.
   */
  findById(seed: Seed, id: string): Promise<Record<string, any>>

  /**
   * Finds a single entry by its unique slug.
   * Throws EntryNotFoundError if not found.
   */
  findBySlug(seed: Seed, slug: string): Promise<Record<string, any>>

  /**
   * Computes facets (status counts and distinct tags) for a content type.
   */
  getFacets(seed: Seed): Promise<{
    statuses: Record<string, number>
    tagsByColumn: Record<string, string[]>
  }>

  /**
   * Creates a new content entry in the live table.
   * Throws SlugConflictError if the slug is already taken.
   */
  create(seed: Seed, id: string, slug: string, status: string, data: Record<string, any>, options?: RepositoryOptions): Promise<void>

  /**
   * Partially updates an existing entry in the live table.
   * Throws EntryNotFoundError if the ID does not exist.
   */
  update(seed: Seed, id: string, data: Record<string, any>, status?: string, options?: RepositoryOptions): Promise<void>

  /**
   * Deletes an entry from the live table.
   * Returns the deleted row data (useful for media cleanup).
   * Throws EntryNotFoundError if the ID does not exist.
   */
  delete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>

  /**
   * Atomically increments/decrements a numeric field with optional min/max guards.
   * Bypasses document-level lifecycle hooks — it's a single UPDATE statement,
   * used to prevent race conditions on counters (stock, balances).
   * Throws RepositoryError if `fieldName` is not a numeric branch of `seed`, or
   * if the guard conditions fail / the row does not exist.
   */
  mutateField(
    seed: Seed,
    id: string,
    fieldName: string,
    operation: { type: 'increment' | 'decrement'; value: number },
    options?: { min?: number; max?: number },
  ): Promise<{ newValue: number }>

  /**
   * Executes a list of write operations atomically via a single `db.batch`.
   * Document-level lifecycle hooks do NOT run for operations inside this call.
   */
  runBatch(operations: BatchWrite[]): Promise<void>

  /**
   * Saves or updates a pending draft in the mirror table.
   */
  saveDraft(seed: Seed, entryId: string, data: Record<string, any>): Promise<void>

  /**
   * Retrieves the pending draft for a given entry.
   * Returns null if no draft exists.
   */
  getDraft(seed: Seed, entryId: string): Promise<Record<string, any> | null>

  /**
   * Atomic promotion of a draft to the live table.
   * Must use a transaction (db.batch) to update live and delete draft.
   */
  publishDraft(seed: Seed, entryId: string): Promise<void>

  /**
   * Discards the pending draft.
   */
  deleteDraft(seed: Seed, entryId: string): Promise<void>

  /**
   * Checks if a slug is already taken by another entry.
   */
  existsSlug(seed: Seed, slug: string, excludeId?: string): Promise<boolean>

  /**
   * Checks if an entry has a pending draft.
   */
  hasDraft(seed: Seed, entryId: string): Promise<boolean>

  /**
   * Aggregates pending drafts across every draft-enabled seed in a single round-trip.
   * Exists so the unified /drafts view never issues one query per seed.
   * @param seeds The draft-enabled seeds to scan (caller passes seedRegistry.draftEnabled()).
   * @returns Drafts newest-first; empty array when no seeds or no drafts.
   */
  findPendingDrafts(seeds: Seed[]): Promise<DraftSummary[]>

  /**
   * Apply the same field update to many entries. Returns per-id outcome.
   * Caller is responsible for validation; this method assumes the payload is
   * already shape-checked against the seed.
   */
  bulkUpdate(
    seedSlug: string,
    ids: string[],
    fields: Record<string, BulkFieldUpdate>,
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }>
}
