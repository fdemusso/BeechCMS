// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

const mocked = vi.hoisted(() => ({ remove: vi.fn(), restore: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { content: { ":slug": { ":id": { $delete: mocked.remove, restore: { $post: mocked.restore } } } } } },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/shared/hooks/use-permissions", () => ({ usePermissions: vi.fn() }))

import { toast } from "sonner"
import { usePermissions, type PermissionsApi } from "@/features/shared/hooks/use-permissions"
import type { ContentEntry } from "@/lib/dynamic-columns"
import type { ContentListWithMeta } from "../../api/content.api"
import { CONTENT_QUERY_KEYS, TRASH_QUERY_KEYS } from "../../consts/content.keys"
import {
  UNDO_DELETE_TOAST_MS,
  useDeleteWithUndo,
  type DeleteWithUndoVariables,
} from "../../hooks/use-delete-with-undo"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts") as Seed

// Canonical entries carry no client-side id (the server mints it), so these are UUIDv4 literals in the production format.
const ENTRY_A = "5b0a6b3e-2f4e-4c1a-9a53-0c9d3f1e7a01"
const ENTRY_B = "7c1d8e4f-3a5f-4d2b-8b64-1d0e4a2f8b02"
const ENTRY_C = "9d2e9f50-4b60-4e3c-9c75-2e1f5b3a9c03"

function entryOf(id: string): ContentEntry {
  return { id, slug: `slug-${id.slice(0, 4)}`, status: "published", data: {}, created_at: 1, updated_at: 1 }
}

function pageOf(page: number, items: ContentEntry[]): ContentListWithMeta {
  return { items, total: 3, page, limit: 2, relations: {} }
}

const PAGE_ONE_KEY = CONTENT_QUERY_KEYS.list(posts.slug, { page: 1 })
const PAGE_TWO_KEY = CONTENT_QUERY_KEYS.list(posts.slug, { page: 2 })

function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(PAGE_ONE_KEY, pageOf(1, [entryOf(ENTRY_A), entryOf(ENTRY_B)]))
  client.setQueryData(PAGE_TWO_KEY, pageOf(2, [entryOf(ENTRY_C)]))
  return client
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

function permissionsWith(can: PermissionsApi["can"]) {
  vi.mocked(usePermissions).mockReturnValue({ can } as unknown as PermissionsApi)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function undoActionOf(toastCallIndex: number) {
  const options = vi.mocked(toast.success).mock.calls[toastCallIndex][1]
  return options?.action as { label: string; onClick: () => void } | undefined
}

describe("useDeleteWithUndo", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    permissionsWith(() => true)
    mocked.remove.mockResolvedValue({ json: async () => ({ success: true, softDeleted: true }) })
    mocked.restore.mockResolvedValue({ json: async () => ({ success: true, slug: posts.slug }) })
  })

  function renderDeleteHook() {
    return renderHook(() => useDeleteWithUndo(), { wrapper: wrapper(queryClient) })
  }

  async function runDelete(
    result: { current: ReturnType<typeof useDeleteWithUndo> },
    variables: DeleteWithUndoVariables,
  ) {
    let outcome = false
    await act(async () => {
      outcome = await result.current.deleteWithUndo(variables)
    })
    return outcome
  }

  it("removes the entry from every cached list page of its seed before the DELETE resolves", async () => {
    const pendingDelete = deferred<{ json: () => Promise<{ success: boolean }> }>()
    mocked.remove.mockReturnValueOnce(pendingDelete.promise)
    queryClient.setQueryData(PAGE_TWO_KEY, pageOf(2, [entryOf(ENTRY_A), entryOf(ENTRY_C)]))
    const { result } = renderDeleteHook()

    act(() => {
      void result.current.deleteWithUndo({ slug: posts.slug, id: ENTRY_A })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_ONE_KEY)?.items.map((e) => e.id)).toEqual([ENTRY_B])
    })
    expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_TWO_KEY)?.items.map((e) => e.id)).toEqual([ENTRY_C])

    await act(async () => pendingDelete.resolve({ json: async () => ({ success: true }) }))
  })

  it("decrements total only on the page that contained the entry", async () => {
    const { result } = renderDeleteHook()

    await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_ONE_KEY)?.total).toBe(2)
    expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_TWO_KEY)?.total).toBe(3)
  })

  it("sends a soft DELETE with no purge flag", async () => {
    const { result } = renderDeleteHook()

    await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    expect(mocked.remove).toHaveBeenCalledTimes(1)
    expect(mocked.remove).toHaveBeenCalledWith({ param: { slug: posts.slug, id: ENTRY_A }, query: {} })
  })

  it("on success raises one toast lasting UNDO_DELETE_TOAST_MS with an Undo action", async () => {
    const { result } = renderDeleteHook()

    const deleted = await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    expect(deleted).toBe(true)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to Trash",
      expect.objectContaining({ duration: UNDO_DELETE_TOAST_MS }),
    )
    expect(undoActionOf(0)?.label).toBe("Undo")
  })

  it("two deletions raise two toasts with no shared id option", async () => {
    const { result } = renderDeleteHook()

    await runDelete(result, { slug: posts.slug, id: ENTRY_A })
    await runDelete(result, { slug: posts.slug, id: ENTRY_B })

    expect(toast.success).toHaveBeenCalledTimes(2)
    for (const [, options] of vi.mocked(toast.success).mock.calls) {
      expect(options).not.toHaveProperty("id")
    }
  })

  it("the Undo action restores exactly its own entry", async () => {
    const { result } = renderDeleteHook()
    await runDelete(result, { slug: posts.slug, id: ENTRY_A })
    await runDelete(result, { slug: posts.slug, id: ENTRY_B })

    act(() => undoActionOf(0)?.onClick())

    await waitFor(() => expect(mocked.restore).toHaveBeenCalledTimes(1))
    expect(mocked.restore).toHaveBeenCalledWith({ param: { slug: posts.slug, id: ENTRY_A } })
  })

  it("a successful undo invalidates the content and trash key spaces and confirms the restore", async () => {
    const { result } = renderDeleteHook()
    await runDelete(result, { slug: posts.slug, id: ENTRY_A })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    act(() => undoActionOf(0)?.onClick())

    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith("Entry restored"))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: CONTENT_QUERY_KEYS.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TRASH_QUERY_KEYS.all })
  })

  it("a failed undo shows restoreFailed and does not throw", async () => {
    mocked.restore.mockRejectedValueOnce(new Error("restore refused"))
    const { result } = renderDeleteHook()
    await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    act(() => undoActionOf(0)?.onClick())

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not undo — the entry is still in the Trash"),
    )
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it("without content:update the success toast carries no Undo action", async () => {
    permissionsWith((permission) => permission !== "content:update")
    const { result } = renderDeleteHook()

    await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    expect(toast.success).toHaveBeenCalledWith(
      "Moved to Trash",
      expect.objectContaining({ duration: UNDO_DELETE_TOAST_MS, action: undefined }),
    )
  })

  it("a failed DELETE puts the row back in every cached page, shows deleteFailed and resolves false", async () => {
    mocked.remove.mockRejectedValueOnce(new Error("server down"))
    const { result } = renderDeleteHook()

    const deleted = await runDelete(result, { slug: posts.slug, id: ENTRY_A })

    expect(deleted).toBe(false)
    expect(toast.error).toHaveBeenCalledWith("Could not delete the entry")
    expect(toast.success).not.toHaveBeenCalled()
    expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_ONE_KEY)).toEqual(
      pageOf(1, [entryOf(ENTRY_A), entryOf(ENTRY_B)]),
    )
    expect(queryClient.getQueryData<ContentListWithMeta>(PAGE_TWO_KEY)).toEqual(pageOf(2, [entryOf(ENTRY_C)]))
  })

  it("raises the undo toast even when the calling component has unmounted before the DELETE resolves", async () => {
    const pendingDelete = deferred<{ json: () => Promise<{ success: boolean }> }>()
    mocked.remove.mockReturnValueOnce(pendingDelete.promise)
    const { result, unmount } = renderDeleteHook()
    act(() => {
      void result.current.deleteWithUndo({ slug: posts.slug, id: ENTRY_A })
    })
    await waitFor(() => expect(mocked.remove).toHaveBeenCalledTimes(1))

    // Regression guard: callbacks passed to `mutate(vars, {...})` are dropped on unmount,
    // mutation-level options are not. The entry editor unmounts right after calling delete.
    unmount()
    pendingDelete.resolve({ json: async () => ({ success: true }) })

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to Trash",
      expect.objectContaining({ duration: UNDO_DELETE_TOAST_MS }),
    )
  })
})
