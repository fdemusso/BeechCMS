// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormLayout, SeedViewConfig } from './seed-layout.js'

export interface SeedLayoutRecord {
  slug: string
  layout: FormLayout
  updatedAt: number
  updatedBy: string
}

export interface ISeedLayoutRepository {
  /** Return the stored layout for a seed, or null if none was ever saved. */
  get(slug: string): Promise<SeedLayoutRecord | null>
  /** Return all stored layouts, keyed by slug — used by GET /api/schema to enrich. */
  getAllAsMap(): Promise<Map<string, FormLayout>>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(slug: string, layout: FormLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — used by the "Reset" action. */
  remove(slug: string): Promise<void>
  /** Return the per-view config blob for a seed, or null if none was stored. */
  getViewConfig(slug: string): Promise<SeedViewConfig | null>
  /** Upsert the per-view config for a seed. */
  setViewConfig(slug: string, config: SeedViewConfig, updatedBy: string): Promise<void>
}
