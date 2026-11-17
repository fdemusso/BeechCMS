// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import type { TFunction } from "i18next"
import type { PageAction } from "@/features/shared/hooks/use-page-actions"
import {
  buildEntryPageActions,
  ENTRY_EDITOR_HOST_ID,
  type EntryPageActionHandlers,
  type EntryPageActionsInput,
} from "../../lib/entry-page-actions"

const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440000"
const SEED_SLUG = "posts"

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${Object.values(options).join(" ")}` : key) as unknown as TFunction

function createHandlers(): { [Name in keyof EntryPageActionHandlers]: ReturnType<typeof vi.fn<() => void>> } {
  return { save: vi.fn(), publishDraft: vi.fn(), requestDiscardDraft: vi.fn(), remove: vi.fn() }
}

/** A published entry opened for live editing; each test overrides what it varies. */
function input(overrides: Partial<EntryPageActionsInput> = {}): EntryPageActionsInput {
  return {
    t,
    schemaSlug: SEED_SLUG,
    entryId: ENTRY_ID,
    title: "Edit Post",
    ready: true,
    isCreate: false,
    isDraftContext: false,
    effectiveDraftContext: false,
    hasSaveDropdown: false,
    hasPendingDraftNotice: false,
    hasRestrictedRefs: false,
    isReadOnly: false,
    isWorking: false,
    handlers: createHandlers(),
    ...overrides,
  }
}

const DRAFT_WITH_DROPDOWN: Partial<EntryPageActionsInput> = {
  isDraftContext: true,
  effectiveDraftContext: true,
  hasSaveDropdown: true,
}

const PENDING_DRAFT_OUTSIDE_DRAFT_CONTEXT: Partial<EntryPageActionsInput> = { hasPendingDraftNotice: true }

function actionsOf(overrides: Partial<EntryPageActionsInput> = {}): PageAction[] {
  return [...(buildEntryPageActions(input(overrides))?.actions ?? [])]
}

function actionById(id: string, overrides: Partial<EntryPageActionsInput> = {}): PageAction {
  const found = actionsOf(overrides).find((action) => action.id === id)
  if (!found) throw new Error(`Missing action ${id}`)
  return found
}

describe("buildEntryPageActions", () => {
  it("returns null while the form is not ready", () => {
    const declaration = buildEntryPageActions(input({ ready: false }))

    expect(declaration).toBeNull()
  })

  it("the action ids per editor state match the table", () => {
    const cases: ReadonlyArray<[string, Partial<EntryPageActionsInput>, string[]]> = [
      ["live edit", {}, ["save", "delete", "copy-id"]],
      ["draft context with dropdown", DRAFT_WITH_DROPDOWN, ["save", "publish-draft", "discard-draft", "copy-id"]],
      [
        "pending draft outside draft context",
        PENDING_DRAFT_OUTSIDE_DRAFT_CONTEXT,
        ["save", "discard-draft", "delete", "copy-id"],
      ],
      ["create", { isCreate: true, entryId: undefined }, ["save"]],
      ["read-only", { isReadOnly: true }, ["copy-id"]],
    ]

    for (const [state, overrides, expectedIds] of cases) {
      expect(actionsOf(overrides).map((action) => action.id), state).toEqual(expectedIds)
    }
  })

  it("the save label follows the button", () => {
    const cases: ReadonlyArray<[string, Partial<EntryPageActionsInput>, string]> = [
      ["draft context", DRAFT_WITH_DROPDOWN, "content.editor.saveDraft"],
      ["create in draft context", { isDraftContext: true, isCreate: true, entryId: undefined }, "content.editor.saveDraft"],
      ["create", { isCreate: true, entryId: undefined }, "common.create"],
      ["live edit", {}, "content.editor.save"],
    ]

    for (const [state, overrides, expectedLabel] of cases) {
      expect(actionById("save", overrides).label, state).toBe(expectedLabel)
    }
  })

  it("save requires content:create in create mode and content:update otherwise, scoped to the seed; delete requires content:delete", () => {
    const createSave = actionById("save", { isCreate: true, entryId: undefined })
    const editSave = actionById("save")
    const remove = actionById("delete")

    expect(createSave.requires).toEqual({ permission: "content:create", scope: SEED_SLUG })
    expect(editSave.requires).toEqual({ permission: "content:update", scope: SEED_SLUG })
    expect(remove.requires).toEqual({ permission: "content:delete", scope: SEED_SLUG })
  })

  it("only publish-draft carries a confirmation", () => {
    const withConfirm = actionsOf({ ...DRAFT_WITH_DROPDOWN, hasPendingDraftNotice: true })
      .filter((action) => action.confirm !== undefined)
      .map((action) => action.id)

    expect(withConfirm).toEqual(["publish-draft"])
  })

  it("while a mutation is in flight every mutating action carries the busy reason and copy-id stays enabled", () => {
    const actions = actionsOf({ ...PENDING_DRAFT_OUTSIDE_DRAFT_CONTEXT, isWorking: true })

    const reasons = Object.fromEntries(actions.map((action) => [action.id, action.unavailableReason]))

    expect(reasons).toEqual({
      save: "content.editor.busy",
      "discard-draft": "content.editor.busy",
      delete: "content.editor.busy",
      "copy-id": undefined,
    })
  })

  it("delete carries the blocked-by-references reason when references restrict it", () => {
    const remove = actionById("delete", { hasRestrictedRefs: true })

    expect(remove.unavailableReason).toBe("backrefs.deleteBlocked ?")
  })

  it("each action runs its own handler", () => {
    const cases: ReadonlyArray<[string, keyof EntryPageActionHandlers, Partial<EntryPageActionsInput>]> = [
      ["save", "save", {}],
      ["publish-draft", "publishDraft", DRAFT_WITH_DROPDOWN],
      ["discard-draft", "requestDiscardDraft", DRAFT_WITH_DROPDOWN],
      ["delete", "remove", {}],
    ]

    for (const [actionId, handlerName, overrides] of cases) {
      const handlers = createHandlers()
      const { perform } = actionById(actionId, { ...overrides, handlers })
      if (perform.kind !== "run") throw new Error(`Expected ${actionId} to run`)

      perform.run()

      for (const [name, handler] of Object.entries(handlers)) {
        expect(handler, `${actionId} → ${name}`).toHaveBeenCalledTimes(name === handlerName ? 1 : 0)
      }
    }
  })

  it("copy-id copies the entry id without running any handler", () => {
    const handlers = createHandlers()

    const { perform } = actionById("copy-id", { handlers })

    expect(perform).toEqual({ kind: "copy", value: ENTRY_ID })
    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true)
  })

  it("the declaration targets the entry id, and null in create mode", () => {
    const editing = buildEntryPageActions(input())
    const creating = buildEntryPageActions(input({ isCreate: true, entryId: undefined }))

    expect(editing).toMatchObject({ hostId: ENTRY_EDITOR_HOST_ID, targetId: ENTRY_ID, title: "Edit Post" })
    expect(creating).toMatchObject({ hostId: ENTRY_EDITOR_HOST_ID, targetId: null })
  })
})
