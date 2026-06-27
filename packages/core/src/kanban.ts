// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch, FilterGroup } from './types.js'

/** Branch types that can form a discrete, finite set of columns (KB §2). */
export type KanbanAxisBranchType = 'text' | 'tags' | 'boolean'

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
}

/** Per-seed, dashboard-side kanban view preferences. Persisted in
 *  seed_layouts.view_config (KB-S02). NOT part of FormLayout. */
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
  if (NON_AXIS_TYPES.has(b.type)) return null
  if (b.type === 'text') return (b.options && b.options.length > 0) ? 'text' : null
  if (b.type === 'tags') return 'tags'
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

/**
 * Deterministic, stable column order for a chosen axis (Q2). The "Senza valore"
 * (value: null) column is always appended last. Values out of `options` are NOT
 * given their own column (KB-U25) — the board folds them into "Senza valore".
 *
 * @param distinctTagValues unique tag values observed in data (tags axis without options).
 */
export function resolveKanbanColumns(
  branch: Branch,
  distinctTagValues: string[] = [],
): KanbanColumnDescriptor[] {
  const cols: KanbanColumnDescriptor[] = []
  if (branch.type === 'boolean') {
    cols.push({ value: 'false', label: 'No' }, { value: 'true', label: 'Sì' }) // [false, true]
  } else if (branch.type === 'text' && branch.options?.length) {
    for (const o of branch.options) cols.push({ value: o, label: o })           // options order
  } else if (branch.type === 'tags') {
    const ordered = branch.options?.length
      ? branch.options
      : [...distinctTagValues].sort((a, b) => a.localeCompare(b))               // alphabetical
    for (const o of ordered) cols.push({ value: o, label: o })
  }
  const isRequired = Boolean(branch.requiredOnCreate || branch.requiredOnUpdate)
  if (!isRequired) {
    cols.push({ value: null, label: `Senza ${branch.label}` })                  // always last if not required
  }
  return cols
}

/**
 * Pure: the FilterGroup selecting one kanban column's entries for a given axis branch.
 * `value: null` ⇒ "Senza valore" — entries where the axis field is NULL or empty (KB-U25).
 * Boolean descriptor values 'true'/'false' are coerced to actual booleans for the engine.
 */
/** Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 *  AND the position upsert atomically (KB-S04e). */
export interface KanbanMoveBody {
  /** Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch. */
  axisBranchId: string
  /** New fractional-index key for this entry in the destination column (KB-S04b/d). */
  position: string
  /** Present only on a cross-column move (axis value changed). Omit for same-column reorder. */
  axis?:
    | { kind: 'scalar'; value: string | null }
    | { kind: 'tags'; oldValue: string | null; newValue: string | null }
}

export function kanbanColumnFilter(branch: Branch, value: string | null): FilterGroup {
  if (value === null) {
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
