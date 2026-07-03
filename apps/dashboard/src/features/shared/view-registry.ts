// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { DashboardView } from '@beechcms/core'

export type ToolbarTool =
  | 'filter'
  | 'sort'
  | 'automation'
  | 'search'
  | 'settings'
  | 'create'

export interface ViewDefinition {
  type: DashboardView
  labelKey: string
  enabledTools: ToolbarTool[]
}

export interface IViewRegistry {
  register(def: ViewDefinition): void
  get(type: DashboardView): ViewDefinition | undefined
  list(): ViewDefinition[]
}
