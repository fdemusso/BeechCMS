// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch, FilterGroup } from '../../engine/types.js'
import { isLocalizedBranch } from '../../engine/localization/localization.js'
import { isSingleChoiceTags, tagOptionValues } from '../../engine/seeds/tag-options.js'

/** Branch types that can form a discrete, finite set of columns (KB §2). */
export type KanbanAxisBranchType = 'tags' | 'boolean'

/** A branch eligible to be the kanban axis. */
export interface KanbanAxisCandidate {
  /** Stable branch id (br_XX) — persisted as the axis key. Never the alias. */
  branchId: string
  alias: string
  label: string
  type: KanbanAxisBranchType
}

/** A single column on the board, in deterministic display order (Q2). */
export interface KanbanColumnDescriptor {
  /** The discrete axis value. `null` ⇒ the always-last "Senza valore" column. */
  value: string | null
  label: string
  /** The option color (#RRGGBB) of a tags-axis column. Absent on boolean columns and on the null column. */
  color?: string
  /**
   * True on the null column of a required axis. No valid entry belongs there: it only collects entries
   * whose value is missing or no longer an option, so none disappears from the board. The board shows it
   * only while it holds entries and never moves or creates an entry into it.
   */
  fallback?: true
}

/** Per-seed, dashboard-side kanban view preferences. Persisted in
 *  seed_views.config.kanban (one per Kanban view instance). NOT part of FormLayout. */
export interface KanbanConfig {
  /** Chosen axis branch id, or null when the user has not configured one (KB-U02). */
  axisBranchId: string | null
  /** Card sort inside columns. null ⇒ manual order via kanban_positions (KB-U22b). */
  sort: { branchId: string; dir: 'ASC' | 'DESC' } | null
  /** Axis values the user chose to hide when columns exceed the cap (KB-U06c). */
  hiddenColumnValues?: string[]
}

export type KanbanIncompatibleReason = 'drafts-enabled' | 'no-candidate-branch'

export interface KanbanCompatibility {
  compatible: boolean
  reason?: KanbanIncompatibleReason
  candidates: KanbanAxisCandidate[]
}

/** Branch types that are explicitly never an axis (KB §2). */
const NON_AXIS_TYPES = new Set<Branch['type']>([
  'richtext', 'file', 'number', 'date', 'json', 'relation', 'repeater',
])

function isAxisCandidate(b: Branch): KanbanAxisBranchType | null {
  if (b.alias === 'status') return null            // system status excluded (KB §2)
  // A localized value is a locale dictionary, not one discrete column value, and a card move would
  // overwrite every translation with the column value.
  if (isLocalizedBranch(b)) return null
  if (NON_AXIS_TYPES.has(b.type)) return null
  if (b.type === 'tags') return isSingleChoiceTags(b) && tagOptionValues(b).length > 0 ? 'tags' : null
  if (b.type === 'boolean') return 'boolean'
  return null
}

/**
 * Determines whether a seed can be displayed as a Kanban board, and which
 * branches may serve as the column axis. Pure — no I/O. (KB-S01)
 *
 * Q3: seeds with `allowDrafts: true` are NOT kanban-compatible.
 */
export function resolveKanbanConfig(seed: Seed): KanbanCompatibility {
  if (seed.allowDrafts) {
    return { compatible: false, reason: 'drafts-enabled', candidates: [] }
  }
  const candidates: KanbanAxisCandidate[] = []
  for (const b of seed.branches) {
    const type = isAxisCandidate(b)
    if (type) candidates.push({ branchId: b.id, alias: b.alias, label: b.label, type })
  }
  if (candidates.length === 0) {
    return { compatible: false, reason: 'no-candidate-branch', candidates: [] }
  }
  return { compatible: true, candidates }
}

/** True when every entry must hold an axis value, so moving a card to the null column is never valid. */
export function isKanbanAxisRequired(branch: Pick<Branch, 'requiredOnCreate' | 'requiredOnUpdate'>): boolean {
  return Boolean(branch.requiredOnCreate || branch.requiredOnUpdate)
}

/**
 * Deterministic, stable column order for a chosen axis (Q2). The "Senza valore"
 * (value: null) column is always appended last; on a required axis it is a `fallback` column.
 * Values out of `options` are NOT given their own column (KB-U25): {@link kanbanColumnFilter}
 * folds them into "Senza valore".
 * A tags axis yields one column per option, in declared order, carrying the option color.
 */
export function resolveKanbanColumns(branch: Branch): KanbanColumnDescriptor[] {
  const cols: KanbanColumnDescriptor[] = []
  if (branch.type === 'boolean') {
    cols.push({ value: 'false', label: 'No' }, { value: 'true', label: 'Sì' }) // [false, true]
  } else if (branch.type === 'tags') {
    for (const option of branch.options ?? []) {
      cols.push({ value: option.value, label: option.value, color: option.color })
    }
  }
  const nullColumn: KanbanColumnDescriptor = { value: null, label: `Senza ${branch.label}` }
  cols.push(isKanbanAxisRequired(branch) ? { ...nullColumn, fallback: true } : nullColumn)
  return cols
}

/** Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 *  AND the position upsert atomically (KB-S04e). */
export interface KanbanMoveBody {
  /** Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch. */
  axisBranchId: string
  /** New fractional-index key for this entry in the destination column (KB-S04b/d). */
  position: string
  /** Present only on a cross-column move: the destination column value (`null` = "Senza valore"). */
  axis?: { value: string | null }
}

/**
 * The entry value that puts an entry in the kanban column `columnValue` of `branch`:
 * boolean → `true`/`false` (`null` column → `null`), tags → `[columnValue]` (`null` column → `[]`),
 * any other type → `columnValue` unchanged. Pure.
 */
export function kanbanColumnEntryValue(
  branch: Branch,
  columnValue: string | null,
): boolean | string | string[] | null {
  if (branch.type === 'boolean') return columnValue === null ? null : columnValue === 'true'
  if (branch.type === 'tags') return columnValue === null ? [] : [columnValue]
  return columnValue
}

/**
 * Pure: the FilterGroup selecting one kanban column's entries for a given axis branch.
 * `value: null` ⇒ "Senza valore" — entries where the axis field is NULL or empty (KB-U25).
 * On a tags axis with options it also holds entries whose stored value is no longer an option
 * (removed or renamed in the seed): `not_in` the option values matches both, so no entry
 * falls outside every column.
 * Boolean descriptor values 'true'/'false' are coerced to actual booleans for the engine.
 */
export function kanbanColumnFilter(branch: Branch, value: string | null): FilterGroup {
  if (value === null) {
    const optionValues = branch.type === 'tags' ? tagOptionValues(branch) : []
    if (optionValues.length > 0) {
      return { column: branch.alias, type: 'tags', conditions: [{ op: 'not_in', value: optionValues }] }
    }
    const type = branch.type === 'boolean' ? 'boolean' : branch.type === 'tags' ? 'tags' : 'text'
    return { column: branch.alias, type, conditions: [{ op: 'is_empty', value: null }] }
  }
  if (branch.type === 'boolean') {
    return { column: branch.alias, type: 'boolean', conditions: [{ op: 'eq', value: value === 'true' }] }
  }
  if (branch.type === 'tags') {
    return { column: branch.alias, type: 'tags', conditions: [{ op: 'has_tag', value }] }
  }
  return { column: branch.alias, type: 'select', conditions: [{ op: 'eq', value }] }
}
