// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Permission, Scope } from "@beechcms/core"
import type { IconComponent } from "@/lib/icon-registry"
import type { PermissionsApi } from "@/features/shared"

// Tutte le pagine navigabili nella palette
export type CommandPage =
  | "root"
  | "seeds"
  | "create"
  | "settings"
  | "edit-schema"
  | "search-results"

// Contratto del hook — non esposto come Context React
export interface CommandPaletteState {
  open: boolean
  setOpen: (open: boolean) => void
  pages: CommandPage[]
  currentPage: CommandPage
  pushPage: (page: CommandPage) => void
  popPage: () => void
  search: string
  setSearch: (s: string) => void
}

/** The three questions a provider may ask; same evaluator as the rest of the dashboard. */
export type PalettePermissions = Pick<PermissionsApi, "can" | "canAnywhere" | "canGlobally">

/** Permission an item needs to be ENABLED. Failing it disables the row; it never hides it. */
export interface PaletteRequirement {
  readonly permission: Permission
  /** GLOBAL_SCOPE ('*') or a seed slug. Omitted: held on at least one scope (canAnywhere). */
  readonly scope?: Scope
}

/** A leading character that routes the query to the providers declaring it. Engine-owned table: lib/parse-palette-query.ts. */
export type PalettePrefix = "="

/** What selecting a row does. The engine closes the palette after `navigate`, `run` and `copy`. */
export type PalettePerform =
  | { readonly kind: "navigate"; readonly to: string }
  | { readonly kind: "page"; readonly page: CommandPage }
  | { readonly kind: "run"; readonly run: () => void }
  | { readonly kind: "copy"; readonly value: string }

export interface PaletteItem {
  /** Stable across sessions and languages: `${providerId}:${key}`. Persisted by pins (roadmap 9). */
  readonly id: string
  /** Translated group heading; rows with the same section render together, first appearance wins. */
  readonly section: string
  readonly label: string
  readonly description?: string
  readonly icon: IconComponent
  readonly keywords?: readonly string[]
  /** Key caps rendered on the row, e.g. ["Alt", "N"]. Display only. */
  readonly shortcut?: readonly string[]
  readonly requires?: PaletteRequirement
  /**
   * Relevance on cmdk's scale (0, 1], used instead of the lexical score while typing.
   * For computed rows, whose label never contains the query. Ignored when the query is blank.
   */
  readonly score?: number
  readonly perform: PalettePerform
}

export interface PaletteQueryContext {
  readonly page: CommandPage
  /** The text in the input, trimmed. */
  readonly query: string
  /** The prefix the user typed; `query` then excludes it. Absent: no prefix. */
  readonly prefix?: PalettePrefix
  readonly permissions: PalettePermissions
}

export interface PaletteProvider {
  /** Unique among the providers passed to the palette; first segment of every item id it emits. */
  readonly id: string
  readonly pages: readonly CommandPage[]
  /**
   * When the query starts with this prefix, only providers declaring it contribute.
   * A provider declaring a prefix still answers un-prefixed queries.
   */
  readonly prefix?: PalettePrefix
  /** Synchronous, side-effect free. A surface the caller may not see is simply not returned. */
  readonly getItems: (context: PaletteQueryContext) => readonly PaletteItem[]
}

export interface ResolvedPaletteItem extends PaletteItem {
  /** null: enabled. Otherwise the user-facing text naming the missing permission. */
  readonly disabledReason: string | null
}
