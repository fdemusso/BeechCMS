// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({ schema: vi.fn(), entryGet: vi.fn(), draftGet: vi.fn(), draftPut: vi.fn(), publish: vi.fn(), discard: vi.fn() }))
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
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" } }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import type { PropsWithChildren, SyntheticEvent } from "react"
import { CANONICAL_SEEDS, CANONICAL_ENTRIES } from "@beechcms/testing"
import { ApiError } from "@/lib/http/api-error"
import { toast } from "sonner"
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
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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

  async function editor() {
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>
        <RouterProvider router={createMemoryRouter([{ path: "/", element: children }])} />
      </QueryClientProvider>
    )
    const hook = renderHook(() => useEntryEditorDialog({ schemaSlug: "posts", entryId, isDraftContext: true, onClose }), { wrapper })
    await waitFor(() => expect(hook.result.current.formData.title).toBe("Draft"))
    return hook
  }

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
})
