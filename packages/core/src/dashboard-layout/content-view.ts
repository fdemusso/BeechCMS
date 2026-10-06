// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed } from '../engine/types.js'
import { findBranchById } from '../engine/seeds/seed-registry.js'
import { isViewAuthorized, type DashboardView } from './view-authorization.js'
import {
  kanbanViewConfigSchema,
  kanbanCardConfigSchema,
  validateCardConfigAgainstSeed,
  type KanbanViewConfig,
} from './seed-layout.js'
import { resolveKanbanConfig } from './kanban/kanban.js'

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

/** Zod needs a tuple. Kept equal to AUTHORIZABLE_VIEWS by content-view.test.ts. */
export const VIEW_TYPE_IDS = ['table', 'gallery', 'kanban'] as const satisfies readonly DashboardView[]

// ---------------------------------------------------------------------------
// Column references — Branch IDs or engine system columns, never aliases
// ---------------------------------------------------------------------------

export const VIEW_SYSTEM_COLUMNS = ['slug', 'status', 'created_at', 'updated_at'] as const
export type ViewSystemColumn = (typeof VIEW_SYSTEM_COLUMNS)[number]

const BRANCH_REF_RE = /^br_[A-Za-z0-9]+$/

export const viewColumnRefSchema = z.union([
  z.enum(VIEW_SYSTEM_COLUMNS),
  z.string().regex(BRANCH_REF_RE),
])
export type ViewColumnRef = z.infer<typeof viewColumnRefSchema>

// ---------------------------------------------------------------------------
// Config building blocks
// ---------------------------------------------------------------------------

/** Mirrors the dashboard toolbar operator set (apps/dashboard/src/lib/filter-dsl.ts). */
export const VIEW_FILTER_OPERATORS = [
  'eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_empty', 'is_not_empty',
] as const
/** Mirrors MAX_CONDITIONS_PER_FILTER in the dashboard toolbar. */
export const MAX_VIEW_CONDITIONS = 3

export const viewConditionSchema = z.object({
  op: z.enum(VIEW_FILTER_OPERATORS),
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
})

export const viewFilterSchema = z.object({
  columnRef: viewColumnRefSchema,
  conditions: z.array(viewConditionSchema).min(1).max(MAX_VIEW_CONDITIONS),
})

export const viewSortSchema = z.object({
  columnRef: viewColumnRefSchema,
  desc: z.boolean(),
})

export const viewGroupBySchema = z.object({
  columnRef: viewColumnRefSchema,
  /** Only meaningful on a date column; stripped otherwise by validateViewConfigAgainstSeed. */
  datePrecision: z.object({ year: z.boolean(), month: z.boolean(), day: z.boolean() }).optional(),
})

export const VIEW_DENSITIES = ['compact', 'normal', 'comfortable'] as const

export const viewAppearanceSchema = z.object({
  density: z.enum(VIEW_DENSITIES).optional(),
  hiddenColumns: z.array(viewColumnRefSchema).max(200).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const VIEW_FORMAT_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const
/**
 * View-neutral targets: `element` is the whole row (Table) or card (Gallery/Kanban), `field` is
 * the intersection element × columnRef. The dashboard's legacy `row`/`cell` map 1:1 (Sprint 2).
 */
export const VIEW_FORMAT_TARGETS = ['element', 'field'] as const
export const VIEW_TEXT_STYLES = ['bold', 'italic', 'underline'] as const

export const viewConditionalFormatSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  /** Ascending: 0 wins over 10. */
  priority: z.number().int().min(0).max(1000),
  label: z.string().max(60).optional(),
  columnRef: viewColumnRefSchema,
  conditions: z.array(viewConditionSchema).min(1).max(MAX_VIEW_CONDITIONS),
  tone: z.enum(VIEW_FORMAT_TONES),
  target: z.enum(VIEW_FORMAT_TARGETS),
  textStyles: z.array(z.enum(VIEW_TEXT_STYLES)).max(3).default([]),
})

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------

/**
 * Persisted per-instance configuration. Every key has a default, so `{}` parses into a complete
 * config, and a stored row written by an older dashboard reads back fully shaped. Unknown keys
 * are stripped (zod default), never rejected.
 */
export const contentViewConfigSchema = z.object({
  filters: z.array(viewFilterSchema).max(50).default([]),
  sort: viewSortSchema.nullable().default(null),
  groupBy: viewGroupBySchema.nullable().default(null),
  appearance: viewAppearanceSchema.default({}),
  conditionalFormats: z.array(viewConditionalFormatSchema).max(50).default([]),
  /** Kanban-only. Dropped from any non-kanban instance. */
  kanban: kanbanViewConfigSchema.optional(),
  /** Card layout (Kanban and Gallery). Dropped from any other instance. */
  card: kanbanCardConfigSchema.optional(),
})
export type ContentViewConfig = z.output<typeof contentViewConfigSchema>
export type ViewFilter = z.output<typeof viewFilterSchema>
export type ViewConditionalFormat = z.output<typeof viewConditionalFormatSchema>

export function emptyViewConfig(): ContentViewConfig {
  return contentViewConfigSchema.parse({})
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const VIEW_TITLE_MAX_LENGTH = 60

/** Trimmed. Empty or whitespace-only collapses to null, which means "render the translated type label". */
export const viewTitleSchema = z
  .string()
  .trim()
  .max(VIEW_TITLE_MAX_LENGTH)
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value))

export const createContentViewInputSchema = z.object({
  type: z.enum(VIEW_TYPE_IDS),
  title: viewTitleSchema.optional(),
  config: contentViewConfigSchema.optional(),
})
export type CreateContentViewInput = z.output<typeof createContentViewInputSchema>

export const updateContentViewInputSchema = z
  .object({
    title: viewTitleSchema.optional(),
    /** Whole-config replacement, not a deep merge. */
    config: contentViewConfigSchema.optional(),
  })
  .refine((body) => body.title !== undefined || body.config !== undefined, {
    message: 'Provide at least one of title, config',
  })
export type UpdateContentViewInput = z.output<typeof updateContentViewInputSchema>

export const reorderContentViewsInputSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
})

// ---------------------------------------------------------------------------
// Records and the public shape
// ---------------------------------------------------------------------------

/** The API shape. Timestamps are unix seconds, like every other system table. */
export interface ContentView {
  id: string
  seedSlug: string
  type: DashboardView
  /** null → the client renders the translated label of `type`. */
  title: string | null
  position: number
  config: ContentViewConfig
  createdAt: number
  updatedAt: number
  updatedBy: string
}

/** Storage shape: `type` is unchecked text until projectContentView narrows it. */
export interface ContentViewRecord extends Omit<ContentView, 'type'> {
  type: string
}

// ---------------------------------------------------------------------------
// Cleanup against the live seed
// ---------------------------------------------------------------------------

const SYSTEM_COLUMN_SET = new Set<string>(VIEW_SYSTEM_COLUMNS)
const DATE_SYSTEM_COLUMNS = new Set<string>(['created_at', 'updated_at'])

function refExists(seed: Seed, ref: string): boolean {
  return SYSTEM_COLUMN_SET.has(ref) || findBranchById(seed, ref) !== null
}

function isDateRef(seed: Seed, ref: string): boolean {
  return DATE_SYSTEM_COLUMNS.has(ref) || findBranchById(seed, ref)?.type === 'date'
}

function cleanKanban(kanban: KanbanViewConfig, seed: Seed): KanbanViewConfig {
  const { candidates } = resolveKanbanConfig(seed)
  const axisOk = kanban.axisBranchId !== null && candidates.some((c) => c.branchId === kanban.axisBranchId)
  const sortOk = kanban.sort !== null && findBranchById(seed, kanban.sort.branchId) !== null
  return {
    ...kanban,
    axisBranchId: axisOk ? kanban.axisBranchId : null,
    sort: sortOk ? kanban.sort : null,
  }
}

/**
 * Pure auto-cleanup, never an error: drops references to branches the seed no longer has,
 * duplicate filters on one column, date precision on a non-date grouping, and the Kanban
 * sub-config on a non-kanban instance and the card layout on a table instance. Same policy as validateCardConfigAgainstSeed.
 */
export function validateViewConfigAgainstSeed(
  config: ContentViewConfig,
  seed: Seed,
  type: DashboardView,
): ContentViewConfig {
  const seenFilterRefs = new Set<string>()
  const filters = config.filters.filter((filter) => {
    if (!refExists(seed, filter.columnRef) || seenFilterRefs.has(filter.columnRef)) return false
    seenFilterRefs.add(filter.columnRef)
    return true
  })

  const sort = config.sort && refExists(seed, config.sort.columnRef) ? config.sort : null

  let groupBy = config.groupBy && refExists(seed, config.groupBy.columnRef) ? config.groupBy : null
  if (groupBy?.datePrecision && !isDateRef(seed, groupBy.columnRef)) {
    groupBy = { columnRef: groupBy.columnRef }
  }

  const appearance = { ...config.appearance }
  if (appearance.hiddenColumns) {
    appearance.hiddenColumns = [...new Set(appearance.hiddenColumns)].filter((ref) => refExists(seed, ref))
  }

  const conditionalFormats = config.conditionalFormats.filter((rule) => refExists(seed, rule.columnRef))

  const cleaned: ContentViewConfig = { filters, sort, groupBy, appearance, conditionalFormats }
  if (type === 'kanban' && config.kanban) cleaned.kanban = cleanKanban(config.kanban, seed)
  if ((type === 'kanban' || type === 'gallery') && config.card) {
    cleaned.card = validateCardConfigAgainstSeed(config.card, seed, { mediaImageOnly: type === 'gallery' }).cleaned
  }
  return cleaned
}

// ---------------------------------------------------------------------------
// Projection (storage → API)
// ---------------------------------------------------------------------------

/** null when the seed's allow-list does not authorize the record's type (hidden, never deleted). */
export function projectContentView(record: ContentViewRecord, seed: Seed): ContentView | null {
  const type = record.type
  if (!isViewAuthorized(seed, type)) return null
  return { ...record, type, config: validateViewConfigAgainstSeed(record.config, seed, type) }
}

/** Order-preserving. The caller passes records already sorted by position. */
export function projectContentViews(records: readonly ContentViewRecord[], seed: Seed): ContentView[] {
  const views: ContentView[] = []
  for (const record of records) {
    const view = projectContentView(record, seed)
    if (view) views.push(view)
  }
  return views
}

/**
 * The full position order of a seed's rows after its visible views were reordered. Hidden rows
 * (types the allow-list currently rejects) keep their slot; visible slots are refilled in the
 * requested order. Writing the result compacts positions to 0..n-1 with no duplicates.
 */
export function mergeContentViewOrder(allIds: readonly string[], visibleOrder: readonly string[]): string[] {
  const visible = new Set(visibleOrder)
  const queue = [...visibleOrder]
  return allIds.map((id) => (visible.has(id) ? queue.shift()! : id))
}
