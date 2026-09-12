// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/manifest-order
 * Orders manifest seeds so a relation target is always applied before the seed that points at it.
 *
 * The server validates each candidate against the live set plus that candidate alone, so a brand-new
 * seed whose `targetSeed` is also brand-new is fatal until the target exists. Targets already live in
 * D1, or absent from the manifest entirely, impose no constraint here — the server is the authority on
 * whether they resolve.
 */

import type { Seed } from '@beechcms/core'

export interface ApplyOrder {
  /** Dependency-ordered; ties broken by slug so two runs over one manifest are identical. */
  ordered: Seed[]
  /** Slug groups that reference each other. Non-empty ⇒ no total order exists. */
  cycles: string[][]
}

/** Relation targets this manifest also defines. Self-references are ignored: a seed may point at its
 *  own table, and `planCreateSeed` emits that FK inside the same CREATE TABLE. */
function manifestTargets(seed: Seed, slugs: Set<string>): string[] {
  const targets = new Set<string>()
  for (const branch of seed.branches ?? []) {
    if (branch.type === 'relation' && branch.targetSeed && branch.targetSeed !== seed.slug && slugs.has(branch.targetSeed)) {
      targets.add(branch.targetSeed)
    }
  }
  return [...targets].sort((a, b) => a.localeCompare(b))
}

export function orderSeedsForApply(seeds: Seed[]): ApplyOrder {
  const bySlug = new Map(seeds.map(seed => [seed.slug, seed]))
  const slugs = new Set(bySlug.keys())
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))

  const ordered: Seed[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const cycles: string[][] = []

  function visit(seed: Seed, stack: string[]): void {
    const mark = state.get(seed.slug)
    if (mark === 'done') return
    if (mark === 'visiting') {
      // Record the cycle from its first occurrence in the current stack, so the message names
      // exactly the seeds involved and nothing above them.
      cycles.push([...stack.slice(stack.indexOf(seed.slug)), seed.slug])
      return
    }
    state.set(seed.slug, 'visiting')
    for (const target of manifestTargets(seed, slugs)) {
      const next = bySlug.get(target)
      if (next) visit(next, [...stack, seed.slug])
    }
    state.set(seed.slug, 'done')
    ordered.push(seed)
  }

  for (const seed of sorted) visit(seed, [])

  return { ordered, cycles }
}
