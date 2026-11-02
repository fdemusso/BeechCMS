// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { DashboardSection, DashboardWidgetInstance } from "@beechcms/core"
import { isLockedWidget, lockedColumnFloor } from "@/features/dashboard/builder/locked-widgets"

const LOCKED: DashboardWidgetInstance = { id: "widget-locked", type: "core/locked", config: {} }
const TEXT: DashboardWidgetInstance = { id: "widget-text", type: "core/text", config: {} }

function makeSection(columnWidgets: DashboardWidgetInstance[][]): DashboardSection {
  return {
    id: "section-1",
    columns: columnWidgets.map((widgets, index) => ({ id: `col-${index + 1}`, widgets })),
  }
}

describe("isLockedWidget", () => {
  it("is true only for the core/locked type", () => {
    const types = ["core/locked", "core/text", "core/stat", "custom/unknown-widget", "core/locked-ish"]

    const verdicts = types.map((type) => isLockedWidget({ type }))

    expect(verdicts).toEqual([true, false, false, false, false])
  })
})

describe("lockedColumnFloor", () => {
  it("returns 0 without locked widgets and last-locked-column index plus one otherwise", () => {
    const cases: Array<{ columns: DashboardWidgetInstance[][]; floor: number }> = [
      { columns: [[TEXT], [TEXT]], floor: 0 },
      { columns: [[], []], floor: 0 },
      { columns: [[LOCKED], [TEXT]], floor: 1 },
      { columns: [[TEXT], [LOCKED], [TEXT]], floor: 2 },
      { columns: [[LOCKED], [], [TEXT, LOCKED]], floor: 3 },
    ]

    const floors = cases.map(({ columns }) => lockedColumnFloor(makeSection(columns)))

    expect(floors).toEqual(cases.map(({ floor }) => floor))
  })
})
