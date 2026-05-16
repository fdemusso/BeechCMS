import type { Seed } from './types.js'
import { AUTOMATION_RESERVED_WORDS } from './automations-grammar-words.js'

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

export class SeedRegistry implements ISeedRegistry {
  private readonly seedMap: Map<string, Seed>
  private readonly orderedSeeds: Seed[]

  constructor(seeds: Seed[]) {
    for (const seed of seeds) {
      for (const branch of seed.branches) {
        if (AUTOMATION_RESERVED_WORDS.has(branch.alias)) {
          throw new Error(
            `Seed "${seed.slug}" uses reserved alias "${branch.alias}". `
              + `Pick a different alias — this word is used by the automation template grammar.`,
          )
        }
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
