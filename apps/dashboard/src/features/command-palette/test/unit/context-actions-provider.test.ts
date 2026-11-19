// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { Check, Trash2 } from "@/components/icons"
import type { PageAction, PageActionDeclaration } from "@/features/shared/hooks/use-page-actions"
import { createContextActionsProvider } from "../../providers/context-actions-provider"
import type { PaletteQueryContext } from "../../types"

const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440000"

const queryContext: PaletteQueryContext = {
  page: "root",
  query: "",
  permissions: { can: () => true, canAnywhere: () => true, canGlobally: () => true },
}

function action(overrides: Partial<PageAction> = {}): PageAction {
  return { id: "save", label: "Save", icon: Check, perform: { kind: "run", run: vi.fn() }, ...overrides }
}

function declaration(overrides: Partial<PageActionDeclaration> = {}): PageActionDeclaration {
  return { hostId: "entry-editor", targetId: ENTRY_ID, title: "Edit Post", actions: [action()], ...overrides }
}

function rowsOf(declarations: readonly PageActionDeclaration[], requestConfirm = vi.fn()) {
  return createContextActionsProvider({ declarations, requestConfirm }).getItems(queryContext)
}

describe("createContextActionsProvider", () => {
  it("without declarations it yields no rows", () => {
    const rows = rowsOf([])

    expect(rows).toEqual([])
  })

  it("yields one row per action in declaration order, sectioned by the declaration title, with id context:<hostId>:<targetId>:<actionId>", () => {
    const rows = rowsOf([
      declaration({ actions: [action({ id: "save" }), action({ id: "delete", label: "Delete", icon: Trash2 })] }),
    ])

    expect(rows.map((row) => row.id)).toEqual([
      `context:entry-editor:${ENTRY_ID}:save`,
      `context:entry-editor:${ENTRY_ID}:delete`,
    ])
    expect(rows.map((row) => row.section)).toEqual(["Edit Post", "Edit Post"])
  })

  it("a create-mode declaration (null target) yields ids with new in place of the target", () => {
    const rows = rowsOf([declaration({ targetId: null })])

    expect(rows.map((row) => row.id)).toEqual(["context:entry-editor:new:save"])
  })

  it("carries requires, unavailableReason and keywords from the action", () => {
    const requires = { permission: "content:update", scope: "posts" } as const
    const rows = rowsOf([
      declaration({ actions: [action({ requires, unavailableReason: "Busy", keywords: ["store"] })] }),
    ])

    expect(rows[0]).toMatchObject({ requires, unavailableReason: "Busy", keywords: ["store"] })
  })

  it("an action without confirm keeps its own perform (run function identity, copy value)", () => {
    const run = vi.fn()
    const rows = rowsOf([
      declaration({
        actions: [
          action({ id: "save", perform: { kind: "run", run } }),
          action({ id: "copy-id", perform: { kind: "copy", value: ENTRY_ID } }),
        ],
      }),
    ])

    expect(rows[0].perform).toEqual({ kind: "run", run })
    expect(rows[1].perform).toEqual({ kind: "copy", value: ENTRY_ID })
  })

  it("an action with confirm runs requestConfirm with the host, the target and the action, and does not run the action", () => {
    const run = vi.fn()
    const requestConfirm = vi.fn()
    const confirmable = action({
      id: "publish-draft",
      confirm: { title: "Publish this draft?", description: "It replaces the live version." },
      perform: { kind: "run", run },
    })
    const rows = rowsOf([declaration({ actions: [confirmable] })], requestConfirm)
    const perform = rows[0].perform

    if (perform.kind !== "run") throw new Error("Expected a run perform")
    perform.run()

    expect(requestConfirm).toHaveBeenCalledOnce()
    expect(requestConfirm).toHaveBeenCalledWith({ hostId: "entry-editor", targetId: ENTRY_ID, action: confirmable })
    expect(run).not.toHaveBeenCalled()
  })
})
