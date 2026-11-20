// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { VIEW_TYPE_CATALOGUE } from "@/features/content-toolbar"
import { VIEW_GROUPS } from "@/features/seed-builder/lib/dashboard-views"

describe("seed builder view groups", () => {
  it("place every view type of the content manager catalogue in exactly one group", () => {
    const grouped = VIEW_GROUPS.flatMap((group) => group.types)

    expect([...grouped].sort()).toEqual(VIEW_TYPE_CATALOGUE.map((entry) => entry.type).sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })
})
