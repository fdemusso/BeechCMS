// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

vi.mock("react-router-dom", () => ({
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/content/posts", search: "", state: null }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// Slice-internal mutation hooks wrap HTTP: mocked so the subject (dialog and selection orchestration) is isolated.
vi.mock("../../hooks/use-delete-with-undo", () => ({ useDeleteWithUndo: vi.fn() }))
vi.mock("../../hooks/use-content-facets", () => ({ useDeleteContent: vi.fn() }))

import { toast } from "sonner"
import { useDeleteWithUndo } from "../../hooks/use-delete-with-undo"
import { useDeleteContent } from "../../hooks/use-content-facets"
import { useContentListModals } from "../../hooks/use-content-list-modals"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts") as Seed

const ENTRY_A = "5b0a6b3e-2f4e-4c1a-9a53-0c9d3f1e7a01"
const ENTRY_B = "7c1d8e4f-3a5f-4d2b-8b64-1d0e4a2f8b02"
const ENTRY_C = "9d2e9f50-4b60-4e3c-9c75-2e1f5b3a9c03"

describe("useContentListModals", () => {
  const deleteWithUndo = vi.fn()
  const deleteContent = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    deleteWithUndo.mockResolvedValue(true)
    vi.mocked(useDeleteWithUndo).mockReturnValue({ deleteWithUndo, isDeleting: false })
    vi.mocked(useDeleteContent).mockReturnValue({ mutateAsync: deleteContent } as unknown as ReturnType<
      typeof useDeleteContent
    >)
  })

  it("handleDelete deletes at once without opening the dialog", () => {
    const { result } = renderHook(() => useContentListModals(posts.slug))

    act(() => result.current.handleDelete(ENTRY_A))

    expect(deleteWithUndo).toHaveBeenCalledWith({ slug: posts.slug, id: ENTRY_A })
    expect(result.current.deleteDialogOpen).toBe(false)
  })

  it("handleDelete drops the deleted id from rowSelection", () => {
    const { result } = renderHook(() => useContentListModals(posts.slug))
    act(() => result.current.setRowSelection({ [ENTRY_A]: true, [ENTRY_B]: true }))

    act(() => result.current.handleDelete(ENTRY_A))

    expect(result.current.rowSelection).toEqual({ [ENTRY_B]: true })
  })

  it("handleBulkDelete with two ids opens the confirmation dialog and deletes nothing yet", () => {
    const { result } = renderHook(() => useContentListModals(posts.slug))

    act(() => result.current.handleBulkDelete([ENTRY_A, ENTRY_B]))

    expect(result.current.deleteDialogOpen).toBe(true)
    expect(result.current.entryIdsToDelete).toEqual([ENTRY_A, ENTRY_B])
    expect(deleteWithUndo).not.toHaveBeenCalled()
    expect(deleteContent).not.toHaveBeenCalled()
  })

  it("handleBulkDelete with one id (after dedupe) takes the instant single path", () => {
    const { result } = renderHook(() => useContentListModals(posts.slug))

    act(() => result.current.handleBulkDelete([ENTRY_A, ENTRY_A]))

    expect(deleteWithUndo).toHaveBeenCalledWith({ slug: posts.slug, id: ENTRY_A })
    expect(result.current.deleteDialogOpen).toBe(false)
  })

  it("handleConfirmDelete with all ids succeeding clears the selection and toasts bulkTrashed", async () => {
    deleteContent.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useContentListModals(posts.slug))
    act(() => {
      result.current.setRowSelection({ [ENTRY_A]: true, [ENTRY_B]: true })
      result.current.handleBulkDelete([ENTRY_A, ENTRY_B])
    })

    await act(async () => result.current.handleConfirmDelete())

    expect(toast.success).toHaveBeenCalledWith("2 entries moved to Trash")
    expect(result.current.rowSelection).toEqual({})
    expect(deleteContent).toHaveBeenCalledTimes(2)
  })

  it("handleConfirmDelete with a partial failure rejects with bulkPartialFailure and narrows entryIdsToDelete to the failed ids", async () => {
    deleteContent.mockImplementation(async ({ id }: { id: string }) => {
      if (id === ENTRY_B) throw new Error("server refused")
      return { success: true }
    })
    const { result } = renderHook(() => useContentListModals(posts.slug))
    act(() => {
      result.current.setRowSelection({ [ENTRY_A]: true, [ENTRY_B]: true, [ENTRY_C]: true })
      result.current.handleBulkDelete([ENTRY_A, ENTRY_B, ENTRY_C])
    })

    // Not wrapped in act(): act discards the state updates queued by a callback that rejects.
    const confirmation = result.current.handleConfirmDelete()

    await expect(confirmation).rejects.toThrow("1 of 3 entries could not be moved to the Trash. Confirm to retry them.")
    await waitFor(() => expect(result.current.entryIdsToDelete).toEqual([ENTRY_B]))
    expect(result.current.rowSelection).toEqual({ [ENTRY_B]: true })
    expect(toast.success).not.toHaveBeenCalled()
  })
})
