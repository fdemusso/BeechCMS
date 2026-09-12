// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { Seed, SelectOptions, TrashedMode } from '../engine/types.js'

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

/** Everything a purge caller needs to finish cleanup outside the database. */
export interface PurgeResult {
  /** The row as it existed immediately before erasure — the source of the R2 media keys. */
  row: Record<string, any>
  /** True when a ledger event was appended. False only for a seed without `softDelete`. */
  ledgerWritten: boolean
}

/** Per-id outcome of a bulk trash operation, mirroring `bulkUpdate`'s shape. */
export interface BulkDeleteResult {
  succeeded: string[]
  failed: Array<{ id: string; reason: string }>
}

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
   * Trashed rows are invisible unless `options.trashed` says otherwise.
   * Throws EntryNotFoundError if not found.
   */
  findById(seed: Seed, id: string, options?: { trashed?: TrashedMode }): Promise<Record<string, any>>

  /**
   * Finds a single entry by its unique slug.
   * Throws EntryNotFoundError if not found.
   */
  findBySlug(seed: Seed, slug: string): Promise<Record<string, any>>

  /**
   * Resolves the parent entry ids that reference any of `targetIds` through a MULTI relation
   * branch (junction table). Single-value relations need no lookup — their target id lives in a
   * column on the parent row and is filterable directly.
   *
   * Returns at most `limit` distinct parent ids, in no guaranteed order. Callers that must
   * distinguish "complete" from "truncated" pass `limit = cap + 1` and compare the length.
   *
   * @throws RepositoryError if `branchAlias` is not a `multiple: true` relation branch of `seed`.
   */
  findParentIdsByRelation(
    seed: Seed,
    branchAlias: string,
    targetIds: string[],
    limit: number,
  ): Promise<string[]>

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
   * Atomically applies an axis-value patch AND a kanban_positions upsert in one DB batch (KB-S04e).
   * `patch` is null for same-column reorders (position only).
   */
  updateWithKanbanPosition(
    seed: Seed,
    id: string,
    patch: Record<string, unknown> | null,
    position: string,
    axisBranchId: string,
    ctx: { actor: string },
  ): Promise<{ success: boolean }>

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
    seed: Seed,
    ids: string[],
    fields: Record<string, BulkFieldUpdate>,
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }>

  /**
   * Reversible delete: stamps `deleted_at` and returns the row as it was.
   * Runs `beforeDelete`/`afterDelete`, exactly like `delete`.
   * Leaves junction rows, `_drafts` rows and R2 media untouched — a trashed entry must be
   * restorable whole.
   * @throws RepositoryError if `seed.softDelete` is not true.
   * @throws EntryNotFoundError if no live row with `id` exists.
   */
  softDelete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>

  /**
   * Clears `deleted_at`. When the entry's slug was taken by a live entry in the meantime the
   * UNIQUE constraint rejects the update; the implementation catches it and restores under an
   * auto-renamed slug rather than failing the operation (feature brief §4).
   * @returns The restored row, carrying the slug it actually ended up with.
   * @throws EntryNotFoundError if no TRASHED row with `id` exists.
   */
  restore(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>

  /**
   * Irreversible erasure: runs `beforeDelete`, reads the row, deletes it (junction and
   * `_drafts` rows follow via ON DELETE CASCADE), appends the ledger event, runs `afterDelete`.
   * Works on a live row and on a trashed one.
   * R2 media deletion is NOT performed here — the caller owns it (VSA: no external I/O in the
   * repository beyond the ledger port).
   * @throws EntryNotFoundError if no row with `id` exists.
   */
  purge(seed: Seed, id: string, options?: RepositoryOptions): Promise<PurgeResult>

  /** `restore` applied per id. Never partially fails the batch: each id reports its own outcome. */
  bulkRestore(seed: Seed, ids: string[], options?: RepositoryOptions): Promise<BulkDeleteResult>

  /**
   * `purge` applied per id. Returns the purged rows so the caller can collect R2 media keys.
   */
  bulkPurge(seed: Seed, ids: string[], options?: RepositoryOptions): Promise<
    BulkDeleteResult & { rows: Record<string, any>[] }
  >

  /**
   * Pure query, no side effects: ids of trashed entries whose retention window has elapsed
   * (`deleted_at + seed.retentionDays * 86400 <= now`).
   * Returns [] when the seed has no `retentionDays` or no `softDelete`.
   * Deliberately NOT wired to any scheduler — the recurring-automation adapter is future work
   * (feature brief §2). `now` is supplied by the caller's `IClock`; never read the clock here.
   */
  findExpiredByRetention(seed: Seed, now: number, limit: number): Promise<string[]>
}

