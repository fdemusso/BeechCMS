// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({ schema: vi.fn(), entryGet: vi.fn(), draftGet: vi.fn(), draftPut: vi.fn(), publish: vi.fn(), discard: vi.fn(), canGlobally: vi.fn() }))
vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      schema: { $get: mocked.schema },
      content: {
        ":slug": {
          ":id": {
            $get: mocked.entryGet,
            draft: { $get: mocked.draftGet, $put: mocked.draftPut, $delete: mocked.discard, publish: { $post: mocked.publish } },
          },
        },
      },
    },
  },
}))
vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, canGlobally: mocked.canGlobally, effective: {} }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// One `t` for every render, as i18next gives: a fresh one would defeat the declaration memo.
vi.mock("react-i18next", () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import type { PropsWithChildren, SyntheticEvent } from "react"
import { CANONICAL_SEEDS, CANONICAL_ENTRIES } from "@beechcms/testing"
import { ApiError } from "@/lib/http/api-error"
import { toast } from "sonner"
import { getPageActionDeclarations, type PageAction } from "@/features/shared/hooks/use-page-actions"
import { useEntryEditorDialog } from "../../hooks/use-entry-editor-dialog"

const entryId = "550e8400-e29b-41d4-a716-446655440000"
const detail = "Discard the draft and re-open the entry."

function draftWriteMock(operation: string) {
  return operation === "save" ? mocked.draftPut : mocked.publish
}

// Draft catches discarded structured errors.
describe("useEntryEditorDialog", () => {
  let client: QueryClient
  let onClose: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    vi.clearAllMocks()
    mocked.canGlobally.mockReturnValue(true)
    client =new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    onClose = vi.fn<() => void>()
    mocked.schema.mockResolvedValue({ json: async () => CANONICAL_SEEDS })
    mocked.draftGet.mockResolvedValue({ json: async () => ({ data: { title: "Draft" } }) })
    mocked.entryGet.mockResolvedValue({ json: async () => ({ id: entryId, data: CANONICAL_ENTRIES[0].data, status: "published", updated_at: 1 }) })
  })

  function conflictAction(): () => void {
    const options = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
    const action = options?.action
    if (!action || typeof action !== "object" || !("onClick" in action)) throw new Error("Missing recovery action")
    return () => action.onClick({} as React.MouseEvent<HTMLButtonElement>)
  }

  async function editor(open?: boolean) {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>
        <RouterProvider router={createMemoryRouter([{ path: "/", element: children }])} />
      </QueryClientProvider>
    )
    const hook = renderHook(() => useEntryEditorDialog({ schemaSlug: "posts", entryId, isDraftContext: true, onClose, open }), { wrapper })
    await waitFor(() => expect(hook.result.current.formData.title).toBe("Draft"))
    return hook
  }

  async function openEditor() {
    const hook = await editor(true)
    await waitFor(() => expect(getPageActionDeclarations()).toHaveLength(1))
    return hook
  }

  function publishedAction(id: string): PageAction {
    const action = getPageActionDeclarations()[0]?.actions.find((candidate) => candidate.id === id)
    if (!action || action.perform.kind !== "run") throw new Error(`Missing runnable action ${id}`)
    return action
  }

  function runPublishedAction(id: string) {
    const { perform } = publishedAction(id)
    if (perform.kind === "run") perform.run()
  }

  it("offers the layout builder to a manage_seeds@* holder", async () => {
    const { result } = await editor()

    expect(result.current.canEditLayoutFlag).toBe(true)
    expect(mocked.canGlobally).toHaveBeenCalledWith("manage_seeds")
  })

  it("withholds the layout builder without manage_seeds@*", async () => {
    mocked.canGlobally.mockImplementation((permission: string) => permission !== "manage_seeds")

    const { result } = await editor()

    expect(result.current.canEditLayoutFlag).toBe(false)
    expect(mocked.canGlobally).toHaveBeenCalledWith("manage_seeds")
  })

  it.each(["save", "publish"])("highlights fields when draft %s returns validation errors", async (operation) => {
    const rejection = new ApiError(400, { type: "https://beechcms.dev/problems/content-validation-failed", errors: [{ field: "title", message: "Invalid title" }] })
    draftWriteMock(operation).mockRejectedValueOnce(rejection)
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(result.current.fieldErrors.title).toBe("Invalid title")
    expect(toast.error).toHaveBeenCalledWith("content.editor.validationError")
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(["save", "publish"])("shows API detail and a recovery action when draft %s conflicts", async (operation) => {
    draftWriteMock(operation).mockRejectedValueOnce(new ApiError(409, { type: `https://beechcms.dev/problems/draft-${operation}-conflict`, detail }))
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(toast.error).toHaveBeenCalledWith(detail, { action: { label: operation === "save" ? "content.editor.reload" : "content.editor.discardDraft", onClick: expect.any(Function) } })
    expect(onClose).not.toHaveBeenCalled()
    expect(mocked.discard).not.toHaveBeenCalled()
  })

  it("reloads live and draft values when the save conflict action is selected", async () => {
    mocked.draftPut.mockRejectedValueOnce(new ApiError(409, { type: "https://beechcms.dev/problems/draft-save-conflict", detail }))
    const { result } = await editor()
    await act(async () => result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>))
    mocked.draftGet.mockResolvedValue({ json: async () => ({ data: { title: "Latest draft" } }) })
    mocked.entryGet.mockResolvedValue({ json: async () => ({ id: entryId, data: { title: "Latest live", internal_note: "Latest note" }, status: "published", updated_at: 2 }) })
    const recover = conflictAction()

    await act(async () => { recover() })

    await waitFor(() => expect(result.current.formData.title).toBe("Latest draft"))
    expect(result.current.formData.internal_note).toBe("Latest note")
    expect(mocked.draftGet).toHaveBeenLastCalledWith({ param: { slug: "posts", id: entryId } })
    expect(mocked.entryGet).toHaveBeenCalledWith({ param: { slug: "posts", id: entryId } })
  })

  it("opens discard confirmation when the publish conflict action is selected", async () => {
    mocked.publish.mockRejectedValueOnce(new ApiError(409, { type: "https://beechcms.dev/problems/draft-publish-conflict", detail }))
    const { result } = await editor()
    await act(async () => result.current.handlePublishDraft())
    const recover = conflictAction()

    act(() => recover())

    expect(result.current.showDiscardConfirm).toBe(true)
    expect(mocked.discard).not.toHaveBeenCalled()
  })

  it.each(["save", "publish"])("keeps draft %s open and shows a generic error for unrecognized failures", async (operation) => {
    draftWriteMock(operation).mockRejectedValueOnce({ status: 500 })
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(toast.error).toHaveBeenCalledWith("content.editor.saveError")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("without open the editor publishes nothing", async () => {
    await editor()

    expect(getPageActionDeclarations()).toEqual([])
  })

  it("when open with the draft loaded it publishes the editor's declaration targeting the entry", async () => {
    await openEditor()

    expect(getPageActionDeclarations()[0]).toMatchObject({ hostId: "entry-editor", targetId: entryId })
    expect(getPageActionDeclarations()[0].actions.map((action) => action.id)).toEqual(["save", "publish-draft", "discard-draft", "copy-id"])
  })

  it("editing a field keeps the published declaration object", async () => {
    // Regression guard: re-publishing per keystroke re-renders the palette on every edit.
    const { result } = await openEditor()
    const before = getPageActionDeclarations()[0]

    act(() => result.current.handleInputChange("title", "Typed"))

    await waitFor(() => expect(result.current.formData.title).toBe("Typed"))
    expect(getPageActionDeclarations()[0]).toBe(before)
  })

  it("running the save action saves the draft through the same request as the submit button", async () => {
    mocked.draftPut.mockResolvedValue({ json: async () => ({ success: true }) })
    await openEditor()

    act(() => runPublishedAction("save"))

    await waitFor(() => expect(mocked.draftPut).toHaveBeenCalledOnce())
    expect(mocked.draftPut).toHaveBeenCalledWith(expect.objectContaining({ param: { slug: "posts", id: entryId } }))
  })

  it("running the publish-draft action publishes through the draft publish request", async () => {
    mocked.publish.mockResolvedValue({ json: async () => ({ success: true }) })
    await openEditor()

    act(() => runPublishedAction("publish-draft"))

    await waitFor(() => expect(mocked.publish).toHaveBeenCalledOnce())
    expect(mocked.publish).toHaveBeenCalledWith({ param: { slug: "posts", id: entryId } })
  })

  it("unmounting the editor withdraws its declaration", async () => {
    const { unmount } = await openEditor()

    unmount()

    expect(getPageActionDeclarations()).toEqual([])
  })
})
