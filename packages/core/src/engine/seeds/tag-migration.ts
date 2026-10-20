// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/tag-migration
 * Data migration from the pre-0.9 tag/choice shapes to the closed-vocabulary `tags` contract.
 *
 * Before 0.9 a choice field was either `text` + `options` (a single value stored as a plain string)
 * or `tags` + `options: string[]`. Since 0.9 `options` exists only on `tags` as `{ value, color }[]`,
 * and every stored value is a JSON array. Databases holding the old shapes were rejected at boot with
 * no way forward; this module computes the way forward.
 *
 * Everything here is pure: it plans from seed definitions and emits SQL text. Nothing is executed,
 * so the same plan drives the CLI dry run, `--apply`, and the audit.
 */

import type { Branch, Seed, TagOption } from '../types.js'
import { draftTableName, indexableSearchBranches, tableName } from '../ddl/ddl.js'
import type { SchemaQueryExecutor } from '../introspection/introspection.js'
import { cleanString, isPlainObject } from '../validation/primitives.js'
import { TAG_OPTION_COLOR_RE, tagOptionsIssues } from './tag-options.js'
import { normalizeTagValue, TAG_OPTIONS_MAX_COUNT } from './tag-value.js'

/**
 * Colors assigned, in declaration order, to legacy options that never carried one.
 * Deterministic on purpose: re-running the plan yields the same definition.
 */
export const TAG_MIGRATION_PALETTE: readonly string[] = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#64748b',
]

/** What the plan does with one branch. */
export type TagMigrationAction =
  /** `text` + `options` becomes single-choice `tags`; stored strings are wrapped into arrays. */
  | 'text-to-tags'
  /** `tags` whose `options` are plain strings or carry invalid colors; stored values are untouched. */
  | 'tags-options'
  /** Cannot be converted safely; a human must edit the seed. */
  | 'manual'

export interface TagMigrationStep {
  seed: string
  /** Dotted path when the branch is nested in a repeater, otherwise the alias. */
  alias: string
  action: TagMigrationAction
  /** One line, operator-facing. */
  summary: string
  /** Non-fatal remarks (e.g. a full-text index that still covers the column). */
  warnings: string[]
}

export interface TagMigrationPlan {
  steps: TagMigrationStep[]
  /** Rewritten definitions, only for seeds that changed. Seeds with a `manual` step are not rewritten. */
  seeds: Seed[]
}

/** True when the plan has anything to report or do. */
export function hasTagMigrationWork(plan: TagMigrationPlan): boolean {
  return plan.steps.length > 0
}

/** Steps a human must resolve. */
export function manualTagSteps(plan: TagMigrationPlan): TagMigrationStep[] {
  return plan.steps.filter(step => step.action === 'manual')
}

type Rewrite = { branch: Branch; step: Omit<TagMigrationStep, 'seed'> }

function paletteColor(index: number): string {
  return TAG_MIGRATION_PALETTE[index % TAG_MIGRATION_PALETTE.length]
}

/**
 * Converts whatever a legacy `options` array held into the `{ value, color }` contract.
 * Returns `null` when nothing salvageable remains (the caller then asks for a manual fix).
 */
function rewriteOptions(raw: unknown): TagOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > TAG_OPTIONS_MAX_COUNT) return null

  const seen = new Set<string>()
  const options: TagOption[] = []
  raw.forEach((entry: unknown, index) => {
    let candidate: string | undefined
    let color: string | undefined
    if (typeof entry === 'string') {
      candidate = entry
    } else if (isPlainObject(entry) && typeof entry.value === 'string') {
      candidate = entry.value
      color = typeof entry.color === 'string' && TAG_OPTION_COLOR_RE.test(entry.color) ? entry.color : undefined
    }
    if (candidate === undefined) return

    const normalized = normalizeTagValue(cleanString(candidate))
    if (!normalized.ok || normalized.value === '' || seen.has(normalized.value)) return
    seen.add(normalized.value)
    options.push({ value: normalized.value, color: color ?? paletteColor(options.length) })
  })

  return options.length > 0 ? options : null
}

function manual(branch: Branch, summary: string): Rewrite {
  return { branch, step: { alias: branch.alias, action: 'manual', summary, warnings: [] } }
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}

/** Plans the rewrite of one top-level branch; `null` when it already honours the contract. */
function planBranch(seed: Seed, branch: Branch): Rewrite | null {
  const raw = branch as unknown as Record<string, unknown>
  const ownIssues = tagOptionsIssues({ ...branch, fields: [] })
  const nestedIssues = tagOptionsIssues(branch).length - ownIssues.length

  if (ownIssues.length === 0) {
    return nestedIssues > 0
      ? manual(branch, `a repeater sub-field of '${branch.alias}' uses the legacy options shape; edit the seed by hand`)
      : null
  }

  if (!isSafeIdentifier(branch.alias)) {
    return manual(branch, `alias '${branch.alias}' is not a plain SQL identifier`)
  }
  if (branch.type !== 'text' && branch.type !== 'tags') {
    return manual(branch, `options are not supported on type '${branch.type}'; remove them from the seed`)
  }
  if (branch.localized === true) {
    return manual(branch, `'${branch.alias}' is localized; its stored locale dictionary cannot be wrapped automatically`)
  }
  if (nestedIssues > 0) {
    return manual(branch, `'${branch.alias}' also has legacy options in a repeater sub-field; edit the seed by hand`)
  }

  const options = rewriteOptions(raw.options)
  if (!options) {
    return manual(branch, `'${branch.alias}' has no usable options (empty, over ${TAG_OPTIONS_MAX_COUNT}, or all invalid)`)
  }

  const rewritten: Branch = branch.type === 'text'
    ? { ...branch, type: 'tags', multiple: false, options }
    : { ...branch, options }
  if (tagOptionsIssues(rewritten).length > 0) {
    return manual(branch, `'${branch.alias}' still violates the tags contract after conversion`)
  }

  const warnings: string[] = []
  if (branch.type === 'text' && indexableSearchBranches({ ...seed, branches: [branch] }).length > 0) {
    warnings.push(`'${branch.alias}' was full-text indexed as text; run \`beech schema diff\` to check the search index`)
  }
  return branch.type === 'text'
    ? {
        branch: rewritten,
        step: {
          alias: branch.alias,
          action: 'text-to-tags',
          summary: `'${branch.alias}': text + options → single-choice tags (${options.length} options, values wrapped into arrays)`,
          warnings,
        },
      }
    : {
        branch: rewritten,
        step: {
          alias: branch.alias,
          action: 'tags-options',
          summary: `'${branch.alias}': options rewritten as { value, color } (${options.length} options, values untouched)`,
          warnings,
        },
      }
}

/**
 * Computes what moving `seeds` to the 0.9 tags contract takes. Seeds that already comply produce no
 * step and no rewritten definition, so a clean database yields an empty plan (the operation is idempotent).
 */
export function planTagMigration(seeds: readonly Seed[]): TagMigrationPlan {
  const steps: TagMigrationStep[] = []
  const rewrittenSeeds: Seed[] = []

  for (const seed of seeds) {
    const seedSteps: TagMigrationStep[] = []
    let changed = false
    const branches = seed.branches.map(branch => {
      const rewrite = planBranch(seed, branch)
      if (!rewrite) return branch
      seedSteps.push({ seed: seed.slug, ...rewrite.step })
      if (rewrite.step.action !== 'manual') changed = true
      return rewrite.branch
    })

    steps.push(...seedSteps)
    // A seed with an unresolved branch is left exactly as stored: half a migration is worse than none.
    if (changed && !seedSteps.some(step => step.action === 'manual')) {
      rewrittenSeeds.push({ ...seed, branches })
    }
  }

  return { steps, seeds: rewrittenSeeds }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** `text-to-tags` steps of `seed` that the plan will rewrite. */
function wrapAliases(plan: TagMigrationPlan, seed: Seed): string[] {
  const rewritten = plan.seeds.some(candidate => candidate.slug === seed.slug)
  if (!rewritten) return []
  return plan.steps
    .filter(step => step.seed === seed.slug && step.action === 'text-to-tags')
    .map(step => step.alias)
}

/**
 * The statements that carry the plan out, in execution order: stored values first, then the seed
 * definitions, then the registry-version bump that tells every isolate to rebuild its cached registry.
 * Value wrapping touches the live table and, when drafts are on, the drafts table.
 *
 * `originals` are the definitions the plan was computed from (the physical tables are named after them).
 */
export function tagMigrationStatements(plan: TagMigrationPlan, originals: readonly Seed[]): string[] {
  const statements: string[] = []

  for (const original of originals) {
    for (const alias of wrapAliases(plan, original)) {
      const tables = [tableName(original), ...(original.allowDrafts ? [draftTableName(original)] : [])]
      for (const table of tables) {
        statements.push(`UPDATE ${table} SET ${alias} = NULL WHERE ${alias} = '';`)
        statements.push(
          `UPDATE ${table} SET ${alias} = json_array(${alias}) `
          + `WHERE ${alias} IS NOT NULL AND NOT (json_valid(${alias}) AND json_type(${alias}) = 'array');`,
        )
      }
    }
  }

  for (const seed of plan.seeds) {
    statements.push(
      `UPDATE seeds SET definition = ${quote(JSON.stringify(seed))}, updated_at = unixepoch() WHERE slug = ${quote(seed.slug)};`,
    )
  }
  if (plan.seeds.length > 0) {
    statements.push(
      `UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version';`,
    )
  }
  return statements
}

/** A stored value that is not in the (new) vocabulary of its branch. */
export interface TagOrphan {
  seed: string
  alias: string
  value: string
  rows: number
}

interface OrphanRow extends Record<string, unknown> {
  value: string
  n: number
}

/**
 * Reads, before anything is changed, the stored values the new vocabulary would not contain. They are
 * reported, never deleted or rewritten: the operator decides whether to add an option or fix the rows.
 * Read-only (`SELECT` through the injected executor).
 */
export async function findTagOrphans(
  executor: SchemaQueryExecutor,
  plan: TagMigrationPlan,
  originals: readonly Seed[],
): Promise<TagOrphan[]> {
  const orphans: TagOrphan[] = []

  for (const rewritten of plan.seeds) {
    const original = originals.find(seed => seed.slug === rewritten.slug)
    if (!original) continue
    const table = tableName(original)

    for (const step of plan.steps.filter(candidate => candidate.seed === rewritten.slug && candidate.action !== 'manual')) {
      const branch = rewritten.branches.find(candidate => candidate.alias === step.alias)
      if (!branch?.options) continue
      const allowed = branch.options.map(option => quote(option.value)).join(', ')

      const sql = step.action === 'text-to-tags'
        ? `SELECT ${step.alias} AS value, COUNT(*) AS n FROM ${table} `
          + `WHERE ${step.alias} IS NOT NULL AND ${step.alias} != '' AND ${step.alias} NOT IN (${allowed}) GROUP BY ${step.alias}`
        : `SELECT j.value AS value, COUNT(*) AS n FROM ${table}, `
          + `json_each(CASE WHEN json_valid(${table}.${step.alias}) THEN ${table}.${step.alias} ELSE '[]' END) AS j `
          + `WHERE j.value NOT IN (${allowed}) GROUP BY j.value`

      const rows = await executor.all<OrphanRow>(sql)
      for (const row of rows) {
        orphans.push({ seed: rewritten.slug, alias: step.alias, value: String(row.value), rows: Number(row.n) })
      }
    }
  }
  return orphans
}
