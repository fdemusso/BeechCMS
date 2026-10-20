// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest-seeds
 * Bridges the manifest shape and the engine's `Seed` shape, in both directions.
 */

import { nextBranchId } from '../engine/seeds/seed-registry.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest, ManifestBranch, ManifestSeed } from './manifest.types.js'
import type { Branch, Seed } from '../engine/types.js'

/**
 * Fills in ids for branches authored without one, in declaration order.
 *
 * These ids are AUTHORING-LOCAL and non-authoritative — they exist so `validateSeedDefinitions`,
 * which fatals on a missing id, has a complete `Seed` to check. NEVER send this output to plan/apply:
 * a minted id looks authoritative to the server and shadows the stored one. The CLI sends the raw
 * manifest seeds instead, so `resolveCandidateIds()` matches stored ids by alias.
 */
function withBranchIds(branches: ManifestBranch[]): Branch[] {
  const accumulated: Branch[] = []
  for (const branch of branches) {
    const resolved: Branch = {
      ...branch,
      id: branch.id ?? nextBranchId({ branches: accumulated }),
      ...(branch.fields ? { fields: withBranchIds(branch.fields) } : {}),
    } as Branch
    accumulated.push(resolved)
  }
  return accumulated
}

/** Manifest → engine `Seed[]`, ready for `validateSeedDefinitions` or an MCP plan candidate. */
export function manifestToSeeds(manifest: BeechSchemaManifest): Seed[] {
  return manifest.seeds.map((seed: ManifestSeed) => ({
    ...seed,
    branches: withBranchIds(seed.branches),
  }))
}

/**
 * Engine `Seed[]` → manifest, for a future `beech schema export`.
 *
 * `layout` is stripped: it is server-populated presentation state, not schema. Seeds are sorted by
 * slug so an export is diffable; branch order is preserved because it is the physical column order.
 */
export function seedsToManifest(seeds: Seed[]): BeechSchemaManifest {
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  return {
    version: MANIFEST_VERSION,
    seeds: sorted.map(({ layout: _layout, ...seed }) => seed as ManifestSeed),
  }
}
