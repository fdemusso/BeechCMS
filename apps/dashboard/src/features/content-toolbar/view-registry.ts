// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { DashboardView } from '@beechcms/core'
import type { ToolbarTool } from './shared'

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

export class ViewRegistryImpl implements IViewRegistry {
  private readonly map = new Map<DashboardView, ViewDefinition>()
  register(def: ViewDefinition): void { this.map.set(def.type, def) }
  get(type: DashboardView): ViewDefinition | undefined { return this.map.get(type) }
  list(): ViewDefinition[] { return [...this.map.values()] }
}

export const viewRegistry: IViewRegistry = new ViewRegistryImpl()
