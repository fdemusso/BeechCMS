// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from './types.js'
import { AUTOMATION_RESERVED_WORDS } from '../automations/automations-grammar-words.js'
import { sortSeedsByDependencies } from './seed-registry.js'

const BRANCH_ID_RE = /^br_[A-Za-z0-9]+$/

/**
 * Allowed charset for a branch alias. An alias becomes a raw SQL column name in
 * CREATE TABLE / ADD COLUMN / CREATE INDEX and in SELECT/WHERE/ORDER BY clauses
 * (see engine.ts), so it MUST be restricted to a safe identifier charset to
 * prevent DDL/query injection. Exported so the seeds API rename route reuses the
 * exact same guard — do not inline a divergent copy.
 */
export const BRANCH_ALIAS_RE = /^[a-z][a-zA-Z0-9_]*$/

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
      const cycleMatch = msg.match(/Cyclic dependency detected among seeds: (.*)/)
      if (cycleMatch) {
        const cycleSlugs = cycleMatch[1].split(', ')
        for (const slug of cycleSlugs) {
          result.push({ slug, messages: [msg], fatal: true })
        }
      } else {
        result.push({ slug: '<graph>', messages: [msg], fatal: true })
      }
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

      // Alias becomes a raw SQL column name — reject anything outside the safe
      // identifier charset before it can reach DDL/query string interpolation.
      if (typeof branch.alias !== 'string' || !BRANCH_ALIAS_RE.test(branch.alias)) {
        messages.push(
          `branch alias '${branch.alias}' is invalid. Expected format ${BRANCH_ALIAS_RE.source} ` +
          `(lowercase letter followed by alphanumeric characters or underscores).`,
        )
      }
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

  // ── Fatal 10: repeater sub-field constraints ─────────────────────────────
  {
    const REPEATER_DISALLOWED_SUBTYPES = new Set(['repeater', 'relation', 'file'])
    for (const seed of seeds) {
      const messages: string[] = []
      for (const branch of seed.branches) {
        if (branch.type !== 'repeater') continue
        const subIds = new Set<string>()
        const subAliases = new Set<string>()
        for (const sub of branch.fields ?? []) {
          if (REPEATER_DISALLOWED_SUBTYPES.has(sub.type)) {
            messages.push(
              `branch '${branch.alias}': sub-field '${sub.alias}' has disallowed type '${sub.type}'. ` +
              `Repeater sub-fields cannot be 'repeater', 'relation', or 'file' in v1.`,
            )
          }

          if (!sub.id || !BRANCH_ID_RE.test(sub.id)) {
            messages.push(
              `branch '${branch.alias}': sub-field '${sub.alias}' has invalid id '${sub.id}'. ` +
              `Expected format ^br_[A-Za-z0-9]+$.`,
            )
          } else if (subIds.has(sub.id)) {
            messages.push(`branch '${branch.alias}': duplicate sub-field id '${sub.id}'`)
          }
          if (sub.id) subIds.add(sub.id)

          if (typeof sub.alias !== 'string' || !BRANCH_ALIAS_RE.test(sub.alias)) {
            messages.push(
              `branch '${branch.alias}': sub-field alias '${sub.alias}' is invalid. ` +
              `Expected format ${BRANCH_ALIAS_RE.source}.`,
            )
          } else if (subAliases.has(sub.alias)) {
            messages.push(`branch '${branch.alias}': duplicate sub-field alias '${sub.alias}'`)
          }
          subAliases.add(sub.alias)
        }
      }
      if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
    }
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

  // ── Fatal 11 / Warning 10: repeater cardinality bounds ───────────────────
  {
    for (const seed of seeds) {
      const fatals: string[] = []
      const warnings: string[] = []
      for (const branch of seed.branches) {
        const hasBounds = branch.minItems !== undefined || branch.maxItems !== undefined
        if (!hasBounds) continue

        if (branch.type !== 'repeater') {
          warnings.push(
            `branch '${branch.alias}': minItems/maxItems are ignored on type ` +
            `'${branch.type}' (repeater-only).`,
          )
          continue
        }
        for (const [key, val] of [['minItems', branch.minItems], ['maxItems', branch.maxItems]] as const) {
          if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
            fatals.push(`branch '${branch.alias}': ${key} must be a non-negative integer (got ${val}).`)
          }
        }
        if (
          Number.isInteger(branch.minItems) && Number.isInteger(branch.maxItems) &&
          (branch.minItems as number) > (branch.maxItems as number)
        ) {
          fatals.push(
            `branch '${branch.alias}': minItems (${branch.minItems}) must be <= maxItems (${branch.maxItems}).`,
          )
        }
      }
      if (fatals.length > 0) result.push({ slug: seed.slug, messages: fatals, fatal: true })
      if (warnings.length > 0) result.push({ slug: seed.slug, messages: warnings, fatal: false })
    }
  }

  // ── Fatal 12: displayNameAlias format validation ───────────────────────────
  for (const seed of seeds) {
    if (typeof seed.displayNameAlias !== 'string' || !BRANCH_ALIAS_RE.test(seed.displayNameAlias)) {
      result.push({
        slug: seed.slug,
        messages: [
          `displayNameAlias '${seed.displayNameAlias}' is invalid. Expected format ${BRANCH_ALIAS_RE.source} ` +
          `(lowercase letter followed by alphanumeric characters or underscores).`,
        ],
        fatal: true,
      })
    }
  }

  return result
}

/** Convenience: true iff no fatal issues. */
export function isSeedSetValid(seeds: Seed[]): boolean {
  return validateSeedDefinitions(seeds).every(i => !i.fatal)
}
