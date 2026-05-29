// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Back-reference helpers for the Beech CMS relation system.
 *
 * `buildBackrefMap` is a pure function that iterates the seed registry once
 * and builds a lookup map: targetSlug → sources that point to it.
 * Build this once at app factory time and cache it for the process lifetime.
 */
import type { Seed } from './types.js'

export interface BackrefSource {
  /** Slug of the seed that owns the relation branch */
  sourceSlug: string
  /** `branch.alias` — the FK column name (single) or join-table name suffix (multi) */
  branchAlias: string
  /** `branch.label` — human label for UI grouping */
  branchLabel: string
  /** 'single' for direct FK, 'multi' for many-to-many join table */
  relationship: 'single' | 'multi'
  /** True when branch.onDelete === 'RESTRICT' — used to disable Delete button */
  restricts: boolean
}

/** Map: targetSlug → every source that points to it */
export type BackrefMap = Map<string, BackrefSource[]>

/**
 * Builds the back-reference map from an array of seeds.
 * Pure function — no side-effects, safe to call at startup and cache forever.
 */
export function buildBackrefMap(seeds: Seed[]): BackrefMap {
  const map: BackrefMap = new Map()

  for (const seed of seeds) {
    for (const branch of seed.branches) {
      if (branch.type !== 'relation' || !branch.targetSeed) continue

      const existing = map.get(branch.targetSeed) ?? []
      existing.push({
        sourceSlug: seed.slug,
        branchAlias: branch.alias,
        branchLabel: branch.label,
        relationship: branch.multiple === true ? 'multi' : 'single',
        restricts: branch.onDelete === 'RESTRICT',
      })
      map.set(branch.targetSeed, existing)
    }
  }

  return map
}
