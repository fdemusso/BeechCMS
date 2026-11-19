// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import type { TFunction } from "i18next"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createQuickNotesProvider } from "../../providers/quick-notes-provider"
import {
  QUICK_NOTE_MAX_LENGTH,
  QUICK_NOTES_MAX_COUNT,
  type QuickNote,
} from "../../lib/quick-notes-storage"
import type { QuickNotesState } from "../../use-quick-notes"
import type { PaletteItem, PalettePerform, PalettePermissions, PalettePrefix } from "../../types"

type PermissionsPayload = Parameters<typeof hydrateEffectivePermissions>[0]

function permissionsFor(payload: PermissionsPayload): PalettePermissions {
  const effective = hydrateEffectivePermissions(payload)
  return {
    can: (permission, scope) => hasPermission(effective, permission, scope),
    canAnywhere: (permission) => hasPermissionAnywhere(effective, permission),
    canGlobally: (permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
  }
}

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${Object.values(options).join(" ")}` : key) as unknown as TFunction

const FIRST_NOTE: QuickNote = { id: "5b0e2c1a-3d4f-4a6b-8c7d-9e0f1a2b3c4d", text: "buy milk", createdAt: 1_700_000_200_000 }
const SECOND_NOTE: QuickNote = { id: "6c1f3d2b-4e5a-4b7c-9d8e-0f1a2b3c4d5e", text: "call back", createdAt: 1_700_000_100_000 }

const UNAVAILABLE: QuickNotesState = { status: "unavailable" }

function readyWith(notes: readonly QuickNote[]): QuickNotesState {
  return { status: "ready", notes }
}

function notesAtCap(): QuickNote[] {
  return Array.from({ length: QUICK_NOTES_MAX_COUNT }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    text: `note ${index}`,
    createdAt: 1_700_000_000_000 + index,
  }))
}

function execute(perform: PalettePerform) {
  if (perform.kind !== "run") throw new Error(`expected a run perform, got ${perform.kind}`)
  perform.run()
}

function setup(notes: QuickNotesState) {
  const save = vi.fn()
  const remove = vi.fn()
  const provider = createQuickNotesProvider({
    t,
    notes,
    save,
    remove,
    formatSavedAt: (epochMs) => `saved ${epochMs}`,
  })
  const itemsFor = (query: string, prefix?: PalettePrefix): readonly PaletteItem[] =>
    provider.getItems({ page: "root", query, prefix, permissions: permissionsFor({}) })
  return { save, remove, itemsFor }
}

describe("createQuickNotesProvider", () => {
  it("without a prefix an empty query yields no rows", () => {
    const { itemsFor } = setup(readyWith([FIRST_NOTE]))

    const items = itemsFor("")

    expect(items).toEqual([])
  })

  it("without a prefix a non-empty query yields one copy row per stored note, id notes:<id>", () => {
    const { itemsFor } = setup(readyWith([FIRST_NOTE, SECOND_NOTE]))

    const items = itemsFor("milk")

    expect(items.map((item) => item.id)).toEqual([`notes:${FIRST_NOTE.id}`, `notes:${SECOND_NOTE.id}`])
    expect(items.map((item) => item.perform)).toEqual([
      { kind: "copy", value: FIRST_NOTE.text },
      { kind: "copy", value: SECOND_NOTE.text },
    ])
  })

  it("with # and text the first row is the enabled compose row with score 1 and its perform saves the text", () => {
    const { itemsFor, save } = setup(readyWith([FIRST_NOTE]))

    const [compose] = itemsFor("remember this", "#")
    execute(compose.perform)

    expect(compose.id).toBe("notes:new")
    expect(compose.score).toBe(1)
    expect(compose.unavailableReason).toBeUndefined()
    expect(save).toHaveBeenCalledExactlyOnceWith("remember this")
  })

  it("the compose row carries the reason for an unavailable store, empty text, over-length text and a full list", () => {
    const tooLongText = "x".repeat(QUICK_NOTE_MAX_LENGTH + 1)
    const cases: [QuickNotesState, string, string][] = [
      [UNAVAILABLE, "buy milk", "commandPalette.notes.unavailable"],
      [readyWith([]), "", "commandPalette.notes.typeToSave"],
      [readyWith([]), tooLongText, `commandPalette.notes.tooLong ${tooLongText.length} ${QUICK_NOTE_MAX_LENGTH}`],
      [readyWith(notesAtCap()), "buy milk", `commandPalette.notes.full ${QUICK_NOTES_MAX_COUNT}`],
    ]

    const reasons = cases.map(([state, query]) => setup(state).itemsFor(query, "#")[0].unavailableReason)

    expect(reasons).toEqual(cases.map(([, , reason]) => reason))
  })

  it("a note row copies its text and declares one delete action whose run calls remove with that note", () => {
    const { itemsFor, remove } = setup(readyWith([FIRST_NOTE]))

    const noteRow = itemsFor("", "#")[1]
    const [deleteAction] = noteRow.actions ?? []
    execute(deleteAction.perform)

    expect(noteRow.perform).toEqual({ kind: "copy", value: FIRST_NOTE.text })
    expect(noteRow.actions).toHaveLength(1)
    expect(deleteAction.id).toBe("delete")
    expect(remove).toHaveBeenCalledExactlyOnceWith(FIRST_NOTE)
  })

  it("with # and an unavailable store only the compose row is returned", () => {
    const { itemsFor } = setup(UNAVAILABLE)

    const items = itemsFor("buy milk", "#")

    expect(items.map((item) => item.id)).toEqual(["notes:new"])
  })
})
