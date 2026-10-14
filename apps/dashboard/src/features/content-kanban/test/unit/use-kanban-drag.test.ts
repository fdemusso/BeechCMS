// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import type { Branch } from "@beechcms/core"
import { isBlockedKanbanDrop } from "../../utils/use-kanban-drag"

const optionalAxis: Branch = { id: "br_11", alias: "priority", label: "Priority", type: "tags", multiple: false, options: [{ value: "low", color: "#64748b" }] }
const requiredAxis: Branch = { ...optionalAxis, requiredOnUpdate: true }

describe("isBlockedKanbanDrop", () => {
  it.each([
    ["blocks a cross-column drop on the null column of a required axis", requiredAxis, null, false, true],
    ["allows a reorder inside the null column of a required axis", requiredAxis, null, true, false],
    ["allows a cross-column drop on an option column of a required axis", requiredAxis, "low", false, false],
    ["allows a cross-column drop on the null column of an optional axis", optionalAxis, null, false, false],
  ] as const)("%s", (_name, branch, destColValue, isSameColumn, expected) => {
    const blocked = isBlockedKanbanDrop(branch, destColValue, isSameColumn)

    expect(blocked).toBe(expected)
  })
})
