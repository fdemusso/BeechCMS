// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch } from './types.js'
import { AUTOMATION_RESERVED_WORDS } from '../automations/automations-grammar-words.js'

export interface ISeedRegistry {
  /**
   * Returns all seeds as a flat array, preserving insertion order.
   * Decouples callers from the internal storage shape so the registry
   * implementation can change without touching every route handler.
   */
  all(): Seed[]

  /**
   * Returns the seed with the given slug, or null if not found.
   * Provides a single lookup point that can be overridden in tests
   * without rebuilding the full registry object.
   */
  get(slug: string): Seed | null

  /**
   * Returns seeds that are visible in the dashboard sidebar.
   * A seed is visible when dashboard.hidden is not explicitly true.
   * Eliminates the seeds.filter(s => !s.dashboard?.hidden) pattern
   * that would otherwise be duplicated across route handlers.
   */
  visibleInDashboard(): Seed[]

  /**
   * Returns seeds that have allowPublicRead enabled.
   * Eliminates the seeds.filter(s => s.allowPublicRead) pattern.
   */
  publicReadable(): Seed[]

  /**
   * Returns seeds that have the draft workflow enabled.
   * Eliminates the seeds.filter(s => s.allowDrafts) pattern.
   */
  draftEnabled(): Seed[]
}

const BRANCH_ID_RE = /^br_[A-Za-z0-9]+$/

export class SeedRegistry implements ISeedRegistry {
  private readonly seedMap: Map<string, Seed>
  private readonly orderedSeeds: Seed[]

  constructor(seeds: Seed[]) {
    for (const seed of seeds) {
      const idsInSeed = new Set<string>()
      for (const branch of seed.branches) {
        if (AUTOMATION_RESERVED_WORDS.has(branch.alias)) {
          throw new Error(
            `Seed "${seed.slug}" uses reserved alias "${branch.alias}". `
              + `Pick a different alias — this word is used by the automation template grammar.`,
          )
        }
        if (!branch.id || !BRANCH_ID_RE.test(branch.id)) {
          throw new Error(
            `Seed "${seed.slug}" branch "${branch.alias}" has invalid id "${branch.id}". `
              + `Expected format ^br_[A-Za-z0-9]+$.`,
          )
        }
        if (idsInSeed.has(branch.id)) {
          throw new Error(
            `Seed "${seed.slug}" has duplicate branch id "${branch.id}".`,
          )
        }
        idsInSeed.add(branch.id)
      }
    }
    this.orderedSeeds = seeds
    this.seedMap = new Map(seeds.map(seed => [seed.slug, seed]))
  }

  all(): Seed[] {
    return this.orderedSeeds
  }

  get(slug: string): Seed | null {
    return this.seedMap.get(slug) ?? null
  }

  visibleInDashboard(): Seed[] {
    return this.orderedSeeds.filter(seed => seed.dashboard?.hidden !== true)
  }

  publicReadable(): Seed[] {
    return this.orderedSeeds.filter(seed => seed.allowPublicRead === true)
  }

  draftEnabled(): Seed[] {
    return this.orderedSeeds.filter(seed => seed.allowDrafts === true)
  }
}

/**
 * Named subclass of SeedRegistry for use in test suites.
 * Gives tests a semantic name without requiring any dependency on factory.ts.
 */
export class InMemorySeedRegistry extends SeedRegistry {}

/** Finds a branch by its stable id within a Seed. Returns null if not found. */
export function findBranchById(seed: Seed, id: string): Branch | null {
  return seed.branches.find(b => b.id === id) ?? null
}

/**
 * Returns the next free branch id for a seed in the form `br_NN` (zero-padded to 2,
 * growing as needed). Scans existing ids, never reuses a number already present —
 * even if a branch was removed, its id is not recycled (ids must be globally stable
 * for the life of the seed so layouts/automations/FTS triggers never collide).
 */
export function nextBranchId(seed: Pick<Seed, 'branches'>): string {
  let max = 0
  for (const b of seed.branches) {
    const m = /^br_0*([0-9]+)$/.exec(b.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  const n = max + 1
  return `br_${String(n).padStart(2, '0')}`
}

/**
 * Returns the input seeds reordered so that every seed appears AFTER all the
 * seeds it depends on (its `relation` branch targets). Pure function — does
 * not read from any global registry.
 *
 * Uses Kahn's algorithm (BFS on in-degree) for cycle detection and topological
 * ordering. Sprint 3 (CLI / migration runner) consumes this to create tables in
 * the correct order without disabling SQLite FK constraints.
 *
 * @throws {Error} When a relation targets an unknown slug not in `seeds`.
 * @throws {Error} When a cyclic dependency is detected, listing involved slugs.
 */
export function sortSeedsByDependencies(seeds: ReadonlyArray<Seed>): Seed[] {
  const slugSet = new Set(seeds.map(s => s.slug))

  // Validate all relation targets exist in the input array
  for (const seed of seeds) {
    for (const branch of seed.branches) {
      if (branch.type === 'relation' && branch.targetSeed) {
        if (!slugSet.has(branch.targetSeed)) {
          throw new Error(
            `Seed '${seed.slug}' relates to unknown target '${branch.targetSeed}'`,
          )
        }
      }
    }
  }

  // Build adjacency: inDegree[slug] = number of dependencies
  //                  dependents[slug] = slugs that depend on slug
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const seed of seeds) {
    if (!inDegree.has(seed.slug)) inDegree.set(seed.slug, 0)
    if (!dependents.has(seed.slug)) dependents.set(seed.slug, [])
  }

  for (const seed of seeds) {
    // Deduplicate targets to avoid inflating inDegree on multi-branch refs to same seed
    const targets = new Set(
      seed.branches
        .filter(b => b.type === 'relation' && b.targetSeed)
        .map(b => b.targetSeed as string),
    )
    for (const target of targets) {
      // seed depends on target → increment seed's in-degree
      inDegree.set(seed.slug, (inDegree.get(seed.slug) ?? 0) + 1)
      dependents.get(target)!.push(seed.slug)
    }
  }

  // Kahn's BFS: start with seeds that have no dependencies
  const seedBySlug = new Map(seeds.map(s => [s.slug, s]))
  const queue: string[] = []
  for (const [slug, deg] of inDegree) {
    if (deg === 0) queue.push(slug)
  }

  const result: Seed[] = []
  while (queue.length > 0) {
    const slug = queue.shift()!
    result.push(seedBySlug.get(slug)!)
    for (const dependent of dependents.get(slug) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, newDeg)
      if (newDeg === 0) queue.push(dependent)
    }
  }

  if (result.length !== seeds.length) {
    // Cycle exists — collect participating slugs (those with in-degree > 0 after BFS)
    const cycle = [...inDegree.entries()]
      .filter(([, deg]) => deg > 0)
      .map(([slug]) => slug)
      .sort()
    throw new Error(
      `Cyclic dependency detected among seeds: ${cycle.join(', ')}`,
    )
  }

  return result
}
