// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import type { DashboardView } from "@beechcms/core"
import { viewRegistry } from "@/pages/view-registry"

const ALL_TYPES: DashboardView[] = ["table", "gallery", "kanban"]

describe("viewRegistry", () => {
  it.each(ALL_TYPES)("%s resolves to a definition with a Renderer component", (type) => {
    const definition = viewRegistry.get(type)

    expect(definition?.Renderer).toBeTypeOf("function")
  })

  it("every definition enables the transfer tool", () => {
    for (const definition of viewRegistry.list()) {
      expect(definition.enabledTools).toContain("transfer")
    }
  })

  it("gallery enables the settings tool, for folder grouping", () => {
    const gallery = viewRegistry.get("gallery")

    expect(gallery?.enabledTools).toContain("settings")
  })

  it("settings capability lists: table has all five, gallery groupBy, conditionalFormats, cardLayout and pageSize, kanban conditionalFormats", () => {
    expect(viewRegistry.get("table")?.settings).toEqual(["groupBy", "conditionalFormats", "columns", "pageSize", "density"])
    expect(viewRegistry.get("gallery")?.settings).toEqual(["groupBy", "conditionalFormats", "cardLayout", "pageSize"])
    expect(viewRegistry.get("kanban")?.settings).toEqual(["conditionalFormats"])
  })

  it("only kanban contributes a SettingsSection", () => {
    expect(viewRegistry.get("table")?.SettingsSection).toBeUndefined()
    expect(viewRegistry.get("gallery")?.SettingsSection).toBeUndefined()
    expect(viewRegistry.get("kanban")?.SettingsSection).toBeTypeOf("function")
  })
})
