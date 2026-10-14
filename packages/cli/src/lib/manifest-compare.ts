// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-compare
 * Compares a `beech.schema.ts` manifest against the seed definitions D1 actually holds.
 *
 * This is the "is my snapshot stale / does my authored manifest disagree with what is deployed"
 * half of `beech schema diff`. The "does the physical table match the definition" half is
 * `diffSeed` in `lib/schema-diff.ts`; the two answer different questions and are never merged.
 */

import pc from 'picocolors'
import { normalizeSeedDefinition, type Seed } from '@beechcms/core'
import { MANIFEST_VERSION, seedsToManifest, toCanonicalJson } from '@beechcms/core/schema'
import type { BeechSchemaManifest, ManifestSeed } from '@beechcms/core/schema'

/**
 * - `in_sync`        — the two sides canonicalize identically.
 * - `only_in_manifest` — authored but not deployed; a plan would create it.
 * - `only_in_database` — deployed but absent from the manifest; the snapshot is stale, re-export.
 * - `differs`        — both sides exist and disagree.
 */
export type SeedDriftStatus = 'in_sync' | 'only_in_manifest' | 'only_in_database' | 'differs'

export interface SeedDrift {
  slug: string
  status: SeedDriftStatus
}

export interface ManifestDrift {
  /** Sorted by slug, so two runs against the same pair produce identical output. */
  seeds: SeedDrift[]
  inSync: boolean
}

/**
 * Canonical bytes for one seed reduced by `normalizeSeedDefinition` (branch ids excluded, omitted flags ≡ `false`,
 * omitted `multiple` on `tags` ≡ `true`, `layout` excluded), produced by the SAME frozen serializer the manifest
 * itself is written with — one format, one producer (sprint 1's compatibility surface).
 *
 * Identity here is the alias: the AUTHORITATIVE id match happens server-side in `normalizeCandidate` at apply time.
 * Unknown keys are copied through untouched, so a field this module has never heard of shows up as drift.
 */
function canonicalize(seed: ManifestSeed | Seed): string {
  const normalized = normalizeSeedDefinition(seed) as unknown as ManifestSeed
  return toCanonicalJson({ version: MANIFEST_VERSION, seeds: [normalized] })
}

/** Compares an authored/exported manifest against the definitions live in D1. */
export function compareManifest(manifest: BeechSchemaManifest, liveSeeds: Seed[]): ManifestDrift {
  const authored = new Map(manifest.seeds.map(seed => [seed.slug, canonicalize(seed)]))
  // Live seeds go through `seedsToManifest` first so both sides enter the comparison as manifest
  // shapes (layout stripped, slug-sorted) rather than as two different shapes normalized twice.
  const deployed = new Map(seedsToManifest(liveSeeds).seeds.map(seed => [seed.slug, canonicalize(seed)]))

  const slugs = [...new Set([...authored.keys(), ...deployed.keys()])].sort((a, b) => a.localeCompare(b))
  const seeds: SeedDrift[] = slugs.map(slug => {
    const left = authored.get(slug)
    const right = deployed.get(slug)
    if (left === undefined) return { slug, status: 'only_in_database' }
    if (right === undefined) return { slug, status: 'only_in_manifest' }
    return { slug, status: left === right ? 'in_sync' : 'differs' }
  })

  return { seeds, inSync: seeds.every(seed => seed.status === 'in_sync') }
}

/** Human-readable manifest drift report. Pure formatting — no I/O decisions, no exit codes. */
export function renderManifestDrift(drift: ManifestDrift, manifestPath: string): void {
  if (drift.inSync) {
    console.log(pc.green(`  ✓ ${manifestPath} matches the deployed schema`))
    return
  }
  for (const seed of drift.seeds) {
    switch (seed.status) {
      case 'in_sync':
        console.log(pc.green(`  ✓ ${seed.slug}`)); break
      case 'only_in_manifest':
        console.log(pc.yellow(`  + ${seed.slug} — in the manifest, not deployed (apply would create it)`)); break
      case 'only_in_database':
        console.log(pc.yellow(`  - ${seed.slug} — deployed, absent from the manifest (re-export to refresh)`)); break
      case 'differs':
        console.log(pc.red(`  ≠ ${seed.slug} — manifest and deployed definition disagree`)); break
    }
  }
}
