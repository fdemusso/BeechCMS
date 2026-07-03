// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module Types
 * Core schema types for the Botanical Engine: `Seed` (content type definition),
 * `Branch` (field definition), and the query types consumed by `buildSelectQuery`.
 * Pure data shapes — no runtime logic lives here.
 */

import type { FileAccept } from '../media/file-types.js'
import type { DashboardView } from '../dashboard-layout/view-authorization.js'

/** All supported field value types for a Branch. */
export type BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date' | 'richtext' | 'file' | 'tags' | 'relation' | 'repeater'

/** Specialized configuration for a branch of type 'number'. */
export interface NumberFieldOptions {
  // ---- Presentation & formatting ----
  /** Visual display style. Default: 'decimal'. */
  format?: 'decimal' | 'currency' | 'percentage' | 'compact'
  /** ISO 4217 currency code (required when format === 'currency'). E.g. 'EUR', 'USD'. */
  currency?: string
  /** Custom text prepended to the formatted value. */
  prefix?: string
  /** Custom unit appended to the formatted value (e.g. 'kg', 'm²'). */
  suffix?: string
  /** Explicit number of decimal digits to display and enforce. */
  decimals?: number
  /** Enable/disable thousands separator grouping. Default: true. */
  grouping?: boolean

  // ---- Editor UI controls ----
  /** Alternative input mechanism for the entry editor. Default: 'input'. */
  control?: 'input' | 'slider' | 'rating' | 'stepper'

  // ---- Constraints & validation ----
  /** Minimum allowed value. */
  min?: number
  /** Maximum allowed value. */
  max?: number
  /** Value increment (e.g. 1 for strict integers, 0.5 for half-steps). */
  step?: number
}

/** Specialized configuration for a branch of type 'file'. */
export interface FileFieldOptions {
  /**
   * Semantic type of file accepted.
   * - 'image': renderable images with preview
   * - 'document': PDF/Office/text
   * - 'any': any file (default — UI shows a generic icon, no image render attempt)
   * Default: 'any'.
   */
  accept?: FileAccept
  /**
   * Maximum size of a single file, in bytes.
   * NOTE: the backend /upload endpoint enforces the global MAX_FILE_SIZE_BYTES (5MB) —
   * this field is informational for the UI only; it is not enforced on upload.
   * Default: 5_242_880.
   */
  maxSize?: number
}

/** Branch: definition of a single field. `alias` is the SQL column name. */
export interface Branch {
  /**
   * Stable logical id of this branch, e.g. 'br_01', 'br_title'.
   * Format: ^br_[A-Za-z0-9]+$ — enforced by SeedRegistry at boot (sprint 04-pre).
   *
   * Used by every persistence layer that needs a reference that survives alias renames
   * (FTS triggers, draft indexing, layout JSON, automations). NEVER use alias for that purpose.
   *
   * The Botanical Engine still emits alias as the SQL column name; id is a logical handle.
   */
  id: string
  /** Human-readable alias, used in the API payload and as the SQL column name in the dedicated table. */
  alias: string
  /** UI display label. */
  label: string
  /** Optional help text shown as a tooltip next to the label in the form. UI-only, ignored by the engine. */
  hint?: string
  /** Value type. */
  type: BranchType
  /**
   * Optional semantic variant of the field for UI/validation purposes.
   * `asset-list` on a multiple `file` branch enables gallery management.
   */
  format?: 'plain' | 'markdown' | 'html' | 'date' | 'datetime' | 'asset-list'
  /**
   * Optional cardinality for media fields:
   * - false/undefined: single asset (string URL)
   * - true: asset list (string[] URL)
   */
  multiple?: boolean
  /**
   * Predefined vocabulary for tag/select/multiselect fields.
   * Static list defined in the Seed (not persisted to the DB).
   */
  options?: string[]
  /** Required on create — generates NOT NULL in generateCreateTable. */
  requiredOnCreate?: boolean
  /** Required on update. */
  requiredOnUpdate?: boolean
  /**
   * Access and handling policy for the field.
   * All values are optional — `resolvePolicies(branch)` supplies the defaults.
   */
  policies?: {
    /** How the value is stored. Default: 'plain'. */
    privacy?: 'plain' | 'hash' | 'encrypt'
    /** How the value is returned in API responses. Default: 'full'. */
    visibility?: 'full' | 'masked' | 'hidden'
    /** Whether the field is included in full-text search queries. Default: true. */
    search?: boolean
    /** Whether the field is available as a filter column in the dashboard. Default: true. */
    filter?: boolean
    /** Whether the field is available as a sort column in the dashboard. Default: true. */
    sort?: boolean
    /** Whether the field is included in Public API responses. Default: true. */
    public?: boolean
  }
  /** Advanced options for number fields. Ignored if type !== 'number'. */
  numberOptions?: NumberFieldOptions
  /** Advanced options for file fields. Ignored if type !== 'file'. */
  fileOptions?: FileFieldOptions

  /**
   * Slug of the referenced Seed (without the `content_` prefix).
   * REQUIRED when `type === 'relation'`. Ignored otherwise.
   * Example: 'team' → references table `content_team(id)`.
   */
  targetSeed?: string

  /**
   * SQLite ON DELETE rule applied to the foreign-key constraint.
   * Defaults to 'SET NULL' when `type === 'relation'` and no value is provided.
   * - CASCADE  : delete dependent rows when the parent is deleted.
   * - SET NULL : null out the column when the parent is deleted (default).
   * - RESTRICT : block parent deletion while dependent rows exist.
   *
   * NOTE: When `multiple: true` (introduced in Sprint 5 for many-to-many), this
   * rule applies to the FK from the junction table to the target table.
   */
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'

  /**
   * Sub-schema for `type === 'repeater'`. Each item of the repeater's array
   * value is a record keyed by sub-branch alias, validated against this list.
   * Sub-branches are restricted to leaf/scalar types (no nested `repeater`,
   * `relation`, or `file`) — enforced by validation.ts and seed-validation.ts.
   * Ignored for any other branch type.
   */
  fields?: Branch[]

  /**
   * Minimum number of items a `repeater` value must contain when a value is
   * provided. Repeater-only — ignored for every other branch type.
   *
   * NOTE: this constrains array *length when the field is present*. It does NOT by
   * itself make the field mandatory — an absent/null payload is still allowed unless
   * `requiredOnCreate` / `requiredOnUpdate` is also set. To model "exactly one
   * required object", combine `minItems: 1, maxItems: 1, requiredOnCreate: true`.
   * Must be a non-negative integer and `<= maxItems` when both are set
   * (enforced at boot by seed-validation.ts).
   */
  minItems?: number

  /**
   * Maximum number of items a `repeater` value may contain. Repeater-only — ignored
   * for every other branch type. `maxItems: 1` models a single "object" column.
   * Must be a non-negative integer and `>= minItems` when both are set.
   */
  maxItems?: number
}

/** Dashboard-specific config embedded in a Seed. All fields optional — defaults applied by the dashboard. */
export interface DashboardSeedConfig {
  /** Lucide icon name (string, resolved to component client-side). Default: 'Folder'. */
  icon?: string
  /** Sidebar group label. Ungrouped seeds share a single 'Contents' section. */
  group?: string
  /** Sort order within the group. Lower = higher. Default: 99. */
  order?: number
  /** Hide from sidebar navigation. Default: false. */
  hidden?: boolean
  /** Tooltip description shown in the sidebar. */
  description?: string
  /** UI feature toggles. All default to true unless specified. */
  features?: {
    search?: boolean
    filter?: boolean
    export?: boolean
    bulkDelete?: boolean
  }
  /**
   * Views authorized for this seed in the content manager. When omitted,
   * the dashboard falls back to DEFAULT_AUTHORIZED_VIEWS. 'table' is always
   * guaranteed at read time by resolveAuthorizedViews (universal fallback).
   */
  views?: DashboardView[]
}

/** Seed: schema definition of a content type. */
export interface Seed {
  /** Identifying slug — also the table name: `content_{slug}`. */
  slug: string
  /** Singular UI label. */
  label: string
  /** Plural UI label. Falls back to `label` when absent. */
  labelPlural?: string
  /** Enable reads from the Public API (`GET /api/v1/public/:seed`). Default: false. */
  allowPublicRead?: boolean
  /** Enable creation from the Public API (`POST /api/v1/public/:seed/add`). Default: false. */
  allowPublicPost?: boolean
  /** Enable edits from the Public API (`PUT /api/v1/public/:seed/edit/:id`). Default: false. */
  allowPublicEdit?: boolean
  /**
   * Enables the "pending draft" feature for this seed.
   * When true, generates the `content_{slug}_drafts` table and enables the `/draft` endpoints.
   * Default: false.
   */
  allowDrafts?: boolean
  /**
   * Alias of the branch used as the entry's human-readable name (e.g. "title", "name", "author").
   * Required — UIs use it for display without heuristics.
   */
  displayNameAlias: string
  /** List of fields (Branch). */
  branches: Branch[]
  /** Optional dashboard-specific UI config. Ignored by the Botanical Engine. */
  dashboard?: DashboardSeedConfig
  /** Custom editor form layout. Absent when no override is stored.
   *  Populated server-side by GET /api/schema. Ignored by the Botanical Engine.
   *  Type matches FormLayout from seed-layout.ts — kept as unknown here to avoid circular imports. */
  layout?: unknown
}

// ---- Query types (consumed by buildSelectQuery in the Botanical Engine) ----

/** Comparison/matching operator applied by a filter condition. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'
  | 'has_tag'
  | 'has_any_tag'
  | 'has_all_tags'

/** Declared value type of a filtered column, used to normalize/coerce filter values before binding. */
export type FilterType = 'text' | 'number' | 'date' | 'boolean' | 'tags' | 'select' | 'system' | 'json'

/** A single operator + value pair applied to a FilterGroup's column. */
export interface FilterCondition {
  /** Operator to apply. */
  op: FilterOperator
  /** Comparison value(s). Arrays are only meaningful for `in`/`not_in`/`has_any_tag`/`has_all_tags`. */
  value: string | number | boolean | null | string[] | number[]
}

export interface FilterGroup {
  /** Column name: system column (id/slug/status/created_at/updated_at) or branch alias. */
  column: string
  /** Declared type of the column, used to normalize condition values. */
  type: FilterType
  /** Conditions applied to this column, ANDed together. */
  conditions: FilterCondition[]
}

export interface SelectOptions {
  /** Filter groups, ANDed together. */
  filters?: FilterGroup[]
  /** Sort column and direction. Ignored when `kanbanOrder` is set. */
  orderBy?: { column: string; dir: 'ASC' | 'DESC' }
  /** LIMIT/OFFSET pagination. */
  pagination?: { limit: number; offset: number }
  /** Filters by status. null = no status filter. */
  status?: string | null
  /** Full-text search — uses FTS5 if the seed has indexable richtext/text branches. */
  search?: string
  /** Column projection. Empty = SELECT *. */
  fields?: string[]
  /** When set, LEFT JOIN kanban_positions and order by fractional index (KB-S04c/S05).
   *  Mutually exclusive with `orderBy`; if both present, `kanbanOrder` wins. */
  kanbanOrder?: { seedSlug: string; axisBranchId: string }
  /**
   * When true, generates a COUNT(*) query instead of fetching rows.
   * This omits projections, sorting/ordering clauses, and pagination limits/offsets,
   * while keeping the join/where clauses intact for accurate counts.
   */
  isCount?: boolean
}

/** SQL string paired with its ordered parameter bindings, ready for a D1 `.bind(...)` call. */
export interface ParameterizedQuery {
  /** Parameterized SQL statement, using `?` placeholders. */
  sql: string
  /** Values bound to the `?` placeholders, in order. */
  bindings: (string | number | boolean | null)[]
}
