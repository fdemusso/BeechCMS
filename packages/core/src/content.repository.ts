import { Seed, SelectOptions } from './types.js'

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
  create(seed: Seed, id: string, slug: string, status: string, data: Record<string, any>): Promise<void>

  /**
   * Partially updates an existing entry in the live table.
   * Throws EntryNotFoundError if the ID does not exist.
   */
  update(seed: Seed, id: string, data: Record<string, any>, status?: string): Promise<void>

  /**
   * Deletes an entry from the live table.
   * Returns the deleted row data (useful for media cleanup).
   * Throws EntryNotFoundError if the ID does not exist.
   */
  delete(seed: Seed, id: string): Promise<{ row: Record<string, any> }>

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
}
