// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { Branch, Seed } from "@beechcms/core"
import type { SeedRecordDTO } from "@/features/seed-builder"

const mockNavigate = vi.fn()
const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() }

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useBlocker: () => mockBlocker,
}))

const mockToastSuccess = vi.fn()
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() },
}))

const mockCreateMutateAsync = vi.fn().mockResolvedValue({ slug: "article" })
const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useCreateSeed: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateSeed: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
}))

import { useSeedEditorDialog } from "@/features/seed-builder/hooks/use-seed-editor-dialog"
import { META } from "@/features/seed-builder/lib/meta-seed-layout"

const branches: Branch[] = [
  { id: "br_01", alias: "title", label: "Title", type: "text" },
  { id: "br_02", alias: "body", label: "Body", type: "richtext" },
]

const editRecord: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    labelPlural: "Articles",
    displayNameAlias: "title",
    branches,
  } as Seed,
  status: "active",
  source: "runtime",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

function submitEvent() {
  return { preventDefault: vi.fn() } as unknown as React.SyntheticEvent<HTMLFormElement>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateMutateAsync.mockResolvedValue({ slug: "article" })
  mockUpdateMutateAsync.mockResolvedValue(undefined)
})

describe("useSeedEditorDialog", () => {
  it("presents the Seed as a meta-seed view-model with chrome capabilities disabled", () => {
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord: null,
      activeSeedsForRelation: [],
      onClose: vi.fn(),
    }))

    expect(result.current.isCreate).toBe(true)
    expect(result.current.seed).toEqual({ label: expect.any(String), slug: "_seed" })
    expect(result.current.capabilities).toEqual({
      drafts: false, backrefs: false, delete: false, layoutBuilder: false, dangerZone: false,
    })
    expect(result.current.layout?.tabs.map((t) => t.id)).toEqual(["general", "fields", "dashboard"])
    expect(result.current.branchById[META.branches]?.type).toBe("repeater")
  })

  it("flattens the edit record into formData and locks the slug", () => {
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord,
      activeSeedsForRelation: [],
      onClose: vi.fn(),
    }))

    expect(result.current.isCreate).toBe(false)
    expect(result.current.formData.slug).toBe("article")
    expect(result.current.formData.branches).toEqual(branches)
    expect((result.current.branchById[META.slug] as unknown as { readOnly?: boolean }).readOnly).toBe(true)
  })

  it("derives displayNameAlias options from the current branches list", () => {
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord,
      activeSeedsForRelation: [],
      onClose: vi.fn(),
    }))

    expect(result.current.branchById[META.displayNameAlias]?.options).toEqual(["title", "body"])
  })

  it("create mode: submit assembles a Seed and calls seedsApi.create via the mutation", async () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord: null,
      activeSeedsForRelation: [],
      onClose,
    }))

    act(() => {
      result.current.handleInputChange("slug", "blog")
      result.current.handleInputChange("label", "Blog")
      result.current.handleInputChange("display_name_alias", "title")
    })

    await act(async () => {
      await result.current.handleSubmit(submitEvent())
    })

    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockCreateMutateAsync.mock.calls[0][0]).toMatchObject({
      slug: "blog",
      label: "Blog",
      displayNameAlias: "title",
    })
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled()
    expect(mockToastSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("edit mode: submit calls seedsApi.update with the immutable original slug", async () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord,
      activeSeedsForRelation: [],
      onClose,
    }))

    act(() => {
      result.current.handleInputChange("label", "Article (renamed)")
    })

    await act(async () => {
      await result.current.handleSubmit(submitEvent())
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockUpdateMutateAsync.mock.calls[0][0]).toMatchObject({
      slug: "article",
      seed: expect.objectContaining({ label: "Article (renamed)" }),
    })
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("strips br_new_* ids from newly added branches before submitting", async () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord,
      activeSeedsForRelation: [],
      onClose,
    }))

    act(() => {
      result.current.handleInputChange("branches", [
        ...branches,
        { id: "br_new_1", alias: "subtitle", label: "Subtitle", type: "text" } as Branch,
      ])
    })

    await act(async () => {
      await result.current.handleSubmit(submitEvent())
    })

    const seed = mockUpdateMutateAsync.mock.calls[0][0].seed as Seed
    expect(seed.branches).toHaveLength(3)
    expect(seed.branches[2]).not.toHaveProperty("id")
    expect(seed.branches[2].alias).toBe("subtitle")
  })

  it("stays open and surfaces no second toast when the mutation rejects", async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(new Error("boom"))
    const onClose = vi.fn()
    const { result } = renderHook(() => useSeedEditorDialog({
      editRecord: null,
      activeSeedsForRelation: [],
      onClose,
    }))

    act(() => {
      result.current.handleInputChange("slug", "blog")
      result.current.handleInputChange("label", "Blog")
      result.current.handleInputChange("display_name_alias", "title")
    })

    await act(async () => {
      await result.current.handleSubmit(submitEvent())
    })

    // useCreateSeed's own onError already toasts the RFC 7807 detail — the hook
    // must not pile a second, generic toast on top, and must keep the dialog open.
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
