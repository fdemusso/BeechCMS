// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public API of the content-toolbar slice.
 *
 * Internal helpers in `shared.ts`, `toolbar-hooks/`, and
 * `toolbar-components/` are intentionally NOT re-exported here.
 * If an external caller needs one of them, expose it explicitly
 * after reviewing the dependency.
 */
export { ContentToolbar } from "./content-toolbar"
export { useContentToolbar } from "./use-content-toolbar"
export type { ContentToolbarProps } from "./types"
export type {
  UserViewInstance,
  ToolbarFiltersState,
  ToolbarFilterGroup,
  ToolbarFilterCondition,
  ViewType,
  ToolbarTool,
  FilterGroupType,
  FilterOperator,
} from "./shared"
export { DEFAULT_ENABLED_TOOLS, buildFilterableColumns, defaultOperatorForType, generateConditionId } from "./shared"
export type { FilterableColumn } from "./shared"
