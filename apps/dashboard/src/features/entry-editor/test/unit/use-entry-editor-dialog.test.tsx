// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" } }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import type { PropsWithChildren, SyntheticEvent } from "react"
import { CANONICAL_SEEDS, CANONICAL_ENTRIES } from "@beechcms/testing"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { useEntryEditorDialog } from "../../hooks/use-entry-editor-dialog"

const entryId = "550e8400-e29b-41d4-a716-446655440000"
const detail = "Discard the draft and re-open the entry."

// Draft catches discarded structured errors.
describe("useEntryEditorDialog", () => {
  let client: QueryClient
  let onClose: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    onClose = vi.fn<() => void>()
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === "/schema" ? CANONICAL_SEEDS : url.endsWith("/draft") ? { data: { title: "Draft" } } : { id: entryId, data: CANONICAL_ENTRIES[0].data, status: "published", updated_at: 1 } }))
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
    const rejection = { response: { status: 400, data: { type: "https://beechcms.dev/problems/content-validation-failed", errors: [{ field: "title", message: "Invalid title" }] } } }
    vi.mocked(operation === "save" ? api.put : api.post).mockRejectedValueOnce(rejection)
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(result.current.fieldErrors.title).toBe("Invalid title")
    expect(toast.error).toHaveBeenCalledWith("content.editor.validationError")
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(["save", "publish"])("shows API detail and a recovery action when draft %s conflicts", async (operation) => {
    vi.mocked(operation === "save" ? api.put : api.post).mockRejectedValueOnce({ response: { status: 409, data: { type: `https://beechcms.dev/problems/draft-${operation}-conflict`, detail } } })
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(toast.error).toHaveBeenCalledWith(detail, { action: { label: operation === "save" ? "content.editor.reload" : "content.editor.discardDraft", onClick: expect.any(Function) } })
    expect(onClose).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it("reloads live and draft values when the save conflict action is selected", async () => {
    vi.mocked(api.put).mockRejectedValueOnce({ response: { status: 409, data: { type: "https://beechcms.dev/problems/draft-save-conflict", detail } } })
    const { result } = await editor()
    await act(async () => result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>))
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url.endsWith("/draft") ? { data: { title: "Latest draft" } } : { id: entryId, data: { title: "Latest live", internal_note: "Latest note" }, status: "published", updated_at: 2 } }))
    const recover = conflictAction()

    await act(async () => { recover() })

    await waitFor(() => expect(result.current.formData.title).toBe("Latest draft"))
    expect(result.current.formData.internal_note).toBe("Latest note")
    expect(api.get).toHaveBeenCalledWith(`/content/posts/${entryId}/draft`)
    expect(api.get).toHaveBeenCalledWith(`/content/posts/${entryId}`)
  })

  it("opens discard confirmation when the publish conflict action is selected", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 409, data: { type: "https://beechcms.dev/problems/draft-publish-conflict", detail } } })
    const { result } = await editor()
    await act(async () => result.current.handlePublishDraft())
    const recover = conflictAction()

    act(() => recover())

    expect(result.current.showDiscardConfirm).toBe(true)
    expect(api.delete).not.toHaveBeenCalled()
  })

  it.each(["save", "publish"])("keeps draft %s open and shows a generic error for unrecognized failures", async (operation) => {
    vi.mocked(operation === "save" ? api.put : api.post).mockRejectedValueOnce({ response: { status: 500, data: {} } })
    const { result } = await editor()

    await act(async () => operation === "save" ? result.current.handleSubmit({ preventDefault() {} } as SyntheticEvent<HTMLFormElement>) : result.current.handlePublishDraft())

    expect(toast.error).toHaveBeenCalledWith("content.editor.saveError")
    expect(onClose).not.toHaveBeenCalled()
  })
})
