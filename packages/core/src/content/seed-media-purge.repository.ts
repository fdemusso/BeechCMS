// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

export type SeedPurgePhase = 'live' | 'drafts' | 'purging' | 'done' | 'failed'

export interface SeedPurgeJob {
  id: string
  slug: string
  definition: Seed
  phase: SeedPurgePhase
  cursor: number
  stagedCount: number
  purgedCount: number
}

export interface SeedPurgeRow {
  rowid: number
  data: Record<string, unknown>
}

/** Durable, bounded staging and acknowledgement of media references during seed deletion. */
export interface ISeedMediaPurgeRepository {
  begin(id: string, seed: Seed, now: number): Promise<void>
  get(id: string): Promise<SeedPurgeJob | null>
  getActiveBySlug(slug: string): Promise<SeedPurgeJob | null>
  listPendingIds(limit: number): Promise<string[]>
  claim(id: string, token: string, now: number, leaseSeconds: number): Promise<SeedPurgeJob | null>
  release(id: string, token: string): Promise<void>
  getColumns(table: string): Promise<Set<string> | null>
  readPage(table: string, columns: string[], cursor: number, limit: number): Promise<SeedPurgeRow[]>
  stagePage(id: string, token: string, cursor: number, keys: string[], now: number): Promise<void>
  moveToDrafts(id: string, token: string, now: number): Promise<void>
  dropAndStartPurge(id: string, token: string, statements: string[], now: number): Promise<void>
  abortDrop(id: string, token: string, now: number): Promise<void>
  listKeys(id: string, limit: number): Promise<string[]>
  completeKey(id: string, token: string, key: string, now: number): Promise<void>
  finish(id: string, token: string, now: number): Promise<void>
}
