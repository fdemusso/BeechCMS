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
import type { Seed } from '@beechcms/core'
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

/** Seed-level flags the engine materializes as `false` when omitted by an author. */
const SEED_FLAGS = ['allowDrafts', 'allowPublicRead', 'allowPublicPost', 'allowPublicEdit', 'softDelete'] as const

/** Branch-level flags with the same omitted-means-false semantics. */
const BRANCH_FLAGS = ['requiredOnCreate', 'requiredOnUpdate', 'multiple'] as const

type Comparable = Record<string, unknown>

/**
 * Reduces one seed to the form both sides are compared in.
 *
 * Three normalizations, each preventing a specific false positive:
 *  - `layout` is dropped: it is server-populated presentation state, never authored.
 *  - branch `id` is dropped, recursively: a hand-authored branch has none, and `manifestToSeeds`
 *    mints authoring-local ids that will not match the stored `br_XX`. Identity is the alias here;
 *    the AUTHORITATIVE id match happens server-side in `normalizeCandidate` at apply time.
 *  - the boolean flags above are defaulted, so an author who omits `allowDrafts` does not "differ"
 *    from a stored definition that spells out `allowDrafts: false`.
 *
 * Unknown keys are copied through untouched: a field this function has never heard of must show up
 * as drift, not vanish silently.
 */
function normalizeSeed(seed: ManifestSeed | Seed): Comparable {
  const { layout: _layout, branches, ...rest } = seed as Seed & Comparable
  const normalized: Comparable = { ...rest }
  for (const flag of SEED_FLAGS) normalized[flag] = normalized[flag] === true
  normalized.branches = (branches ?? []).map(normalizeBranch)
  return normalized
}

function normalizeBranch(branch: unknown): Comparable {
  const { id: _id, fields, ...rest } = branch as Comparable & { fields?: unknown[] }
  const normalized: Comparable = { ...rest }
  for (const flag of BRANCH_FLAGS) normalized[flag] = normalized[flag] === true
  if (fields !== undefined) normalized.fields = fields.map(normalizeBranch)
  return normalized
}

/**
 * Canonical bytes for one normalized seed, produced by the SAME frozen serializer the manifest
 * itself is written with — one format, one producer (sprint 1's compatibility surface).
 */
function canonicalize(seed: ManifestSeed | Seed): string {
  const normalized = normalizeSeed(seed) as unknown as ManifestSeed
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
