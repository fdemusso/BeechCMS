// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ISeedRepository, Seed, SeedRecord } from '@beechcms/core'

/**
 * In-memory ISeedRepository for testing and for the config.seeds back-compat shim.
 * Returns a fixed seed list with a static version token.
 */
export class InMemorySeedRepository implements ISeedRepository {
  private readonly seeds: Seed[]
  private version = 1

  constructor(seeds: Seed[]) {
    this.seeds = seeds.filter(s => s && typeof s === 'object' && 'slug' in s)
  }

  async listActive(): Promise<Seed[]> {
    return this.seeds
  }

  async listAll(): Promise<SeedRecord[]> {
    return this.seeds.map(s => ({
      slug: s.slug,
      definition: s,
      status: 'active' as const,
      source: 'code' as const,
      createdAt: 0,
      updatedAt: 0,
    }))
  }

  async get(slug: string): Promise<SeedRecord | null> {
    const s = this.seeds.find(s => s.slug === slug)
    if (!s) return null
    return { slug: s.slug, definition: s, status: 'active', source: 'code', createdAt: 0, updatedAt: 0 }
  }

  async upsert(): Promise<void> {}
  async softDelete(): Promise<void> {}
  async hardDelete(): Promise<void> {}

  async getRegistryVersion(): Promise<number> {
    return this.version
  }

  async bumpRegistryVersion(): Promise<number> {
    return ++this.version
  }
}
