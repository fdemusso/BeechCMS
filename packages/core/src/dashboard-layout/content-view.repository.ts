// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { DashboardView } from './view-authorization.js'
import type { ContentViewConfig, ContentViewRecord } from './content-view.js'

export interface NewContentView {
  seedSlug: string
  type: DashboardView
  title: string | null
  /** Already cleaned by validateViewConfigAgainstSeed. */
  config: ContentViewConfig
}

export interface ContentViewPatch {
  /** undefined → keep; null → reset to the translated type label. */
  title?: string | null
  /** undefined → keep; otherwise replaces the whole config. */
  config?: ContentViewConfig
}

export type RemoveContentViewResult = 'deleted' | 'not-found' | 'last-table'

/**
 * Persistence for shared, ordered view instances (`seed_views`). Every write is one statement
 * or one D1 batch, so each method is atomic. Implementations own id minting and timestamps
 * (IIdGenerator / IClock injected).
 */
export interface IContentViewRepository {
  /** All rows of a seed, including types the allow-list currently hides, ordered by position. */
  listBySeed(seedSlug: string): Promise<ContentViewRecord[]>
  get(seedSlug: string, id: string): Promise<ContentViewRecord | null>
  /**
   * Inserts one untitled instance per type, at positions 0..n-1. Each insert is skipped when the
   * seed already has an instance of that type, so concurrent first reads never duplicate.
   */
  ensureDefaults(seedSlug: string, types: readonly DashboardView[], updatedBy: string): Promise<void>
  /** Appends after the current last position. */
  create(input: NewContentView, updatedBy: string): Promise<ContentViewRecord>
  update(seedSlug: string, id: string, patch: ContentViewPatch, updatedBy: string): Promise<ContentViewRecord | null>
  /** Refuses ('last-table') to delete the seed's only Table instance, atomically. */
  remove(seedSlug: string, id: string): Promise<RemoveContentViewResult>
  /** Writes position = index for each id. Ids not listed keep their position. */
  reorder(seedSlug: string, orderedIds: readonly string[], updatedBy: string): Promise<void>
}
