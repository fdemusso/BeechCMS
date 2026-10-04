// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — the ONLY module allowed to import from multiple content slices.

import type { DashboardView } from "@beechcms/core"
import type { IViewRegistry, ViewDefinition } from "@/features/shared"
import { TABLE_VIEW_DEFINITION } from "@/features/content-management"
import { GALLERY_VIEW_DEFINITION } from "@/features/content-gallery"
import { KANBAN_VIEW_DEFINITION } from "@/features/content-kanban"

export class ViewRegistryImpl implements IViewRegistry {
  private readonly map = new Map<DashboardView, ViewDefinition>()
  register(def: ViewDefinition): void { this.map.set(def.type, def) }
  get(type: DashboardView): ViewDefinition | undefined { return this.map.get(type) }
  list(): ViewDefinition[] { return [...this.map.values()] }
}

export const viewRegistry: IViewRegistry = new ViewRegistryImpl()

viewRegistry.register(TABLE_VIEW_DEFINITION)
viewRegistry.register(GALLERY_VIEW_DEFINITION)
viewRegistry.register(KANBAN_VIEW_DEFINITION)
