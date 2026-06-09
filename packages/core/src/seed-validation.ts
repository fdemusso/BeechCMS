// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from './types.js'
import { AUTOMATION_RESERVED_WORDS } from './automations-grammar-words.js'
import { sortSeedsByDependencies } from './seed-registry.js'

const BRANCH_ID_RE = /^br_[A-Za-z0-9]+$/

export interface SeedValidationIssue {
  slug: string
  messages: string[]
  fatal: boolean
}

/**
 * Pure, console-free, throw-free validation of a seed set.
 * The single seed being created/edited should be validated in the context of
 * the full active set: call validateSeedDefinitions([...otherActiveSeeds, edited]).
 */
export function validateSeedDefinitions(seeds: Seed[]): SeedValidationIssue[] {
  const result: SeedValidationIssue[] = []

  // ── Fatal 1: unknown relation targets ────────────────────────────────────
  const slugSet = new Set(seeds.map(s => s.slug))
  for (const seed of seeds) {
    const messages: string[] = []
    for (const branch of seed.branches) {
      if (branch.type === 'relation' && branch.targetSeed) {
        if (!slugSet.has(branch.targetSeed)) {
          messages.push(`branch '${branch.alias}' targets unknown seed '${branch.targetSeed}'`)
        }
      }
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
  }

  // ── Fatal 2: multi-relation with SET NULL ────────────────────────────────
  for (const seed of seeds) {
    const messages: string[] = []
    for (const branch of seed.branches) {
      if (branch.type === 'relation' && branch.multiple === true && branch.onDelete === 'SET NULL') {
        messages.push(
          `Branch '${branch.alias}': multi-relations cannot use ON DELETE SET NULL. ` +
          `Use 'CASCADE' or 'RESTRICT'.`,
        )
      }
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
  }

  // ── Fatal 3: junction table name collisions / length ─────────────────────
  {
    const junctionNames = new Set<string>()
    for (const seed of seeds) {
      const messages: string[] = []
      for (const branch of seed.branches) {
        if (branch.type !== 'relation' || branch.multiple !== true) continue
        const name = `rel_${seed.slug}_${branch.alias}`
        if (name.length > 256) {
          messages.push(`Junction table name '${name}' exceeds 256 characters (${name.length})`)
        }
        if (junctionNames.has(name)) {
          messages.push(`Junction table name collision: '${name}' already used by another seed/branch`)
        }
        junctionNames.add(name)
      }
      if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
    }
  }

  // ── Fatal 4: dependency cycles ────────────────────────────────────────────
  const hasUnknownTargets = result.some(e => e.fatal)
  if (!hasUnknownTargets) {
    try {
      sortSeedsByDependencies(seeds)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.push({ slug: '<graph>', messages: [msg], fatal: true })
    }
  }

  // ── Fatal 5: branch id format / uniqueness ───────────────────────────────
  for (const seed of seeds) {
    const messages: string[] = []
    const idsInSeed = new Set<string>()
    for (const branch of seed.branches) {
      if (!branch.id || !BRANCH_ID_RE.test(branch.id)) {
        messages.push(
          `branch '${branch.alias}' has invalid id '${branch.id}'. Expected format ^br_[A-Za-z0-9]+$.`,
        )
      } else if (idsInSeed.has(branch.id)) {
        messages.push(`duplicate branch id '${branch.id}'`)
      }
      if (branch.id) idsInSeed.add(branch.id)
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
  }

  // ── Fatal 6: reserved aliases ─────────────────────────────────────────────
  for (const seed of seeds) {
    const messages: string[] = []
    for (const branch of seed.branches) {
      if (AUTOMATION_RESERVED_WORDS.has(branch.alias)) {
        messages.push(
          `branch '${branch.alias}' uses reserved alias. ` +
          `This word is used by the automation template grammar.`,
        )
      }
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
  }

  // ── Warning 7: duplicate slug ─────────────────────────────────────────────
  {
    const slugsSeen = new Set<string>()
    for (const seed of seeds) {
      const messages: string[] = []
      if (slugsSeen.has(seed.slug)) {
        messages.push(`duplicate slug "${seed.slug}" — each seed must have a unique slug`)
      }
      slugsSeen.add(seed.slug)
      if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: false })
    }
  }

  // ── Warning 8: duplicate branch alias within a seed ───────────────────────
  for (const seed of seeds) {
    const messages: string[] = []
    const aliasesSeen = new Set<string>()
    for (const branch of seed.branches) {
      if (aliasesSeen.has(branch.alias)) {
        messages.push(`duplicate branch alias "${branch.alias}"`)
      }
      aliasesSeen.add(branch.alias)
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: false })
  }

  // ── Warning 9: displayNameAlias not in branches ───────────────────────────
  for (const seed of seeds) {
    const allAliases = new Set(seed.branches.map(b => b.alias))
    if (!allAliases.has(seed.displayNameAlias)) {
      result.push({
        slug: seed.slug,
        messages: [`displayNameAlias "${seed.displayNameAlias}" not found in branches`],
        fatal: false,
      })
    }
  }

  return result
}

/** Convenience: true iff no fatal issues. */
export function isSeedSetValid(seeds: Seed[]): boolean {
  return validateSeedDefinitions(seeds).every(i => !i.fatal)
}
