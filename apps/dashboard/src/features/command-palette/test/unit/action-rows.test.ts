// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { toActionRows } from "../../lib/action-rows"
import type { ResolvedPaletteItem } from "../../types"

const noIcon = () => null

function target(overrides: Partial<ResolvedPaletteItem> = {}): ResolvedPaletteItem {
  return {
    id: "search:entry-1",
    section: "Post",
    label: "Canonical Post",
    icon: noIcon,
    perform: { kind: "navigate", to: "/content/posts/entry-1" },
    disabledReason: null,
    ...overrides,
  }
}

describe("toActionRows", () => {
  it("a target with two actions yields two enabled rows in declared order under the target's label", () => {
    const frozen = target({
      actions: [
        { id: "copy-id", label: "Copy ID", icon: noIcon, perform: { kind: "copy", value: "entry-1" } },
        { id: "open", label: "Open", icon: noIcon, perform: { kind: "navigate", to: "/content/posts/entry-1" } },
      ],
    })

    const rows = toActionRows(frozen)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: "actions:copy-id",
      section: "Canonical Post",
      label: "Copy ID",
      perform: { kind: "copy", value: "entry-1" },
      disabledReason: null,
    })
    expect(rows[1]).toMatchObject({
      id: "actions:open",
      section: "Canonical Post",
      perform: { kind: "navigate", to: "/content/posts/entry-1" },
      disabledReason: null,
    })
  })

  it("a target without actions yields no rows", () => {
    const rows = toActionRows(target())

    expect(rows).toEqual([])
  })
})
