// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { Branch, Seed } from "@beechcms/core"
import type { SeedRecordDTO } from "@/features/seed-builder"

const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() }
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => mockBlocker,
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockCreateMutateAsync = vi.fn().mockResolvedValue({ slug: "article" })
const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined)
vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useCreateSeed: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateSeed: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useSeedHasEntries: () => false,
}))

import { useSeedForm, resolveDisplayNameAlias, areBranchesComplete } from "@/features/seed-builder/hooks/use-seed-form"
import { seedToFormData } from "@/features/seed-builder/lib/seed-form-mapping"
import { draftKey, readDraft, writeDraft } from "@/features/seed-builder/lib/seed-draft"

const branches: Branch[] = [
  { id: "br_01", alias: "body", label: "Body", type: "richtext" },
  { id: "br_02", alias: "title", label: "Title", type: "text" },
]

const editRecord: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    displayNameAlias: "title",
    retentionDays: 30,
    branches,
  } as Seed,
  status: "active",
  source: "runtime",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const newField: Branch = { id: "br_new_1", alias: "title", label: "Title", type: "text" }

function submitEvent() {
  return { preventDefault: vi.fn() } as unknown as React.SyntheticEvent<HTMLFormElement>
}

function renderCreate(onClose = vi.fn()) {
  return renderHook(() => useSeedForm({ editRecord: null, takenSlugs: [], onClose, open: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateMutateAsync.mockResolvedValue({ slug: "article" })
  mockUpdateMutateAsync.mockResolvedValue(undefined)
})

describe("resolveDisplayNameAlias", () => {
  it("keeps a chosen alias that still names a branch", () => {
    expect(resolveDisplayNameAlias(branches, "body")).toBe("body")
  })

  it("falls back to the first text branch, then to the first branch", () => {
    expect(resolveDisplayNameAlias(branches, "gone")).toBe("title")
    expect(resolveDisplayNameAlias([branches[0]], "")).toBe("body")
    expect(resolveDisplayNameAlias([], "")).toBe("")
  })
})

describe("areBranchesComplete", () => {
  it("needs at least one field", () => {
    expect(areBranchesComplete([])).toBe(false)
  })

  it("rejects an empty, malformed, reserved or duplicate alias", () => {
    expect(areBranchesComplete([{ ...newField, alias: "" }])).toBe(false)
    expect(areBranchesComplete([{ ...newField, alias: "1abc" }])).toBe(false)
    expect(areBranchesComplete([{ ...newField, alias: "id" }])).toBe(false)
    expect(areBranchesComplete([newField, { ...newField, id: "br_new_2" }])).toBe(false)
  })

  it("rejects a relation without a target seed", () => {
    expect(areBranchesComplete([{ ...newField, type: "relation" }])).toBe(false)
    expect(areBranchesComplete([{ ...newField, type: "relation", targetSeed: "clienti" }])).toBe(true)
  })
})

describe("useSeedForm — slug", () => {
  it("derives the slug from the label while creating, until the slug is typed by hand", () => {
    const { result } = renderCreate()

    act(() => result.current.setLabel("Blog Post"))
    expect(result.current.formData.slug).toBe("blog_post")

    act(() => result.current.setSlug("articles"))
    act(() => result.current.setLabel("Blog Posts"))
    expect(result.current.formData.slug).toBe("articles")
  })

  it("does not rewrite the slug of a stored seed", () => {
    const { result } = renderHook(() => useSeedForm({ editRecord, takenSlugs: [], onClose: vi.fn(), open: true }))
    act(() => result.current.setLabel("Renamed"))
    expect(result.current.formData.slug).toBe("article")
  })
})

describe("useSeedForm — unique slug", () => {
  const renderTaken = (takenSlugs: string[]) =>
    renderHook(() => useSeedForm({ editRecord: null, takenSlugs, onClose: vi.fn(), open: true }))

  it("suffixes the derived slug when it is already in use", () => {
    const { result } = renderTaken(["blog_post", "blog_post_2"])
    act(() => result.current.setLabel("Blog Post"))
    expect(result.current.formData.slug).toBe("blog_post_3")
    expect(result.current.slugTaken).toBe(false)
  })

  it("flags a typed slug that is taken and keeps the step incomplete", () => {
    const { result } = renderTaken(["articles"])
    act(() => result.current.setLabel("Blog Post"))
    act(() => result.current.setSlug("Articles"))

    expect(result.current.formData.slug).toBe("articles")
    expect(result.current.slugTaken).toBe(true)
    expect(result.current.stepComplete.general).toBe(false)
    expect(result.current.canAdvance).toBe(false)
  })

  it("hands the slug back to the label when it is emptied", () => {
    const { result } = renderTaken([])
    act(() => result.current.setLabel("Blog Post"))
    act(() => result.current.setSlug("custom"))
    act(() => result.current.setSlug(""))
    act(() => result.current.setLabel("Blog Posts"))
    expect(result.current.formData.slug).toBe("blog_posts")
  })
})

describe("useSeedForm — guided steps", () => {
  it("locks every step after an incomplete one while creating", () => {
    const { result } = renderCreate()

    expect(result.current.step).toBe("general")
    expect(result.current.isStepReachable("general")).toBe(true)
    expect(result.current.isStepReachable("fields")).toBe(false)
    expect(result.current.isStepReachable("dashboard")).toBe(false)
    expect(result.current.canAdvance).toBe(false)

    act(() => result.current.goNext())
    expect(result.current.step).toBe("general")
  })

  it("unlocks the next step as each one is completed, and Dashboard needs nothing of its own", () => {
    const { result } = renderCreate()

    act(() => result.current.setLabel("Blog Post"))
    expect(result.current.isStepReachable("fields")).toBe(true)
    expect(result.current.isStepReachable("dashboard")).toBe(false)

    act(() => result.current.goNext())
    expect(result.current.step).toBe("fields")

    act(() => result.current.setField("branches", [newField]))
    expect(result.current.isStepReachable("dashboard")).toBe(true)
    act(() => result.current.goNext())
    expect(result.current.step).toBe("dashboard")
    expect(result.current.isLastStep).toBe(true)
    expect(result.current.canSubmit).toBe(true)
  })

  it("moves on instead of saving when submitted before the last step", async () => {
    const { result } = renderCreate()
    act(() => result.current.setLabel("Blog Post"))

    await act(async () => { await result.current.handleSubmit(submitEvent()) })

    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
    expect(result.current.step).toBe("fields")
  })

  it("opens every step at once for a stored seed", () => {
    const { result } = renderHook(() => useSeedForm({ editRecord, takenSlugs: [], onClose: vi.fn(), open: true }))
    expect(result.current.isStepReachable("dashboard")).toBe(true)
    expect(result.current.canSubmit).toBe(true)
  })

  it("starts again from the first step after the dialog is closed", () => {
    const { result, rerender } = renderHook(
      ({ open }) => useSeedForm({ editRecord: null, takenSlugs: [], onClose: vi.fn(), open }),
      { initialProps: { open: true } }
    )
    act(() => result.current.setLabel("Blog Post"))
    act(() => result.current.goNext())
    expect(result.current.step).toBe("fields")

    rerender({ open: false })
    expect(result.current.step).toBe("general")
    expect(result.current.formData.label).toBe("")
  })
})

describe("useSeedForm — saving", () => {
  it("creates the seed with the resolved display name alias and without client-only ids", async () => {
    const onClose = vi.fn()
    const { result } = renderCreate(onClose)

    act(() => result.current.setLabel("Blog Post"))
    act(() => result.current.goNext())
    act(() => result.current.setField("branches", [newField]))
    act(() => result.current.goNext())
    await act(async () => { await result.current.handleSubmit(submitEvent()) })

    const sent = mockCreateMutateAsync.mock.calls[0][0] as Seed
    expect(sent.slug).toBe("blog_post")
    expect(sent.displayNameAlias).toBe("title")
    expect(sent.branches[0]).not.toHaveProperty("id")
    expect(onClose).toHaveBeenCalled()
  })

  it("updates a stored seed and keeps the settings the form has no input for", async () => {
    const { result } = renderHook(() => useSeedForm({ editRecord, takenSlugs: [], onClose: vi.fn(), open: true }))

    act(() => result.current.setField("label", "Articles"))
    await act(async () => { await result.current.handleSubmit(submitEvent()) })

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      slug: "article",
      seed: expect.objectContaining({ label: "Articles", retentionDays: 30 }),
    })
  })

  it("asks for confirmation before closing a dirty form, and closes at once when clean", () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSeedForm({ editRecord, takenSlugs: [], onClose, open: true }))

    act(() => result.current.requestClose())
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => result.current.setField("label", "Changed"))
    act(() => result.current.requestClose())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.confirmDiscardOpen).toBe(true)
  })
})

describe("useSeedForm — draft", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps the edited form in storage once typing pauses", () => {
    vi.useFakeTimers()
    const { result } = renderCreate()

    act(() => result.current.setLabel("Blog Post"))
    expect(readDraft(draftKey(null))).toBeNull()

    act(() => { vi.advanceTimersByTime(300) })
    expect(readDraft(draftKey(null))?.formData).toMatchObject({ label: "Blog Post", slug: "blog_post" })
  })

  it("restores the form, its step and its dirty state when the dialog was open at reload", () => {
    writeDraft(draftKey(null), { formData: { ...seedToFormData(null), label: "Blog Post", slug: "blog_post" }, step: "fields", slugTouched: true })

    const { result } = renderCreate()

    expect(result.current.formData.label).toBe("Blog Post")
    expect(result.current.step).toBe("fields")
    expect(result.current.isDirty).toBe(true)
  })

  it("ignores a draft when the dialog starts closed", () => {
    writeDraft(draftKey(null), { formData: { ...seedToFormData(null), label: "Blog Post" }, step: "general", slugTouched: false })

    const { result } = renderHook(() => useSeedForm({ editRecord: null, takenSlugs: [], onClose: vi.fn(), open: false }))

    expect(result.current.formData.label).toBe("")
    expect(result.current.isDirty).toBe(false)
  })

  it("drops the draft when the dialog closes", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ open }) => useSeedForm({ editRecord: null, takenSlugs: [], onClose: vi.fn(), open }),
      { initialProps: { open: true } }
    )
    act(() => result.current.setLabel("Blog Post"))
    act(() => { vi.advanceTimersByTime(300) })
    expect(readDraft(draftKey(null))).not.toBeNull()

    rerender({ open: false })

    expect(readDraft(draftKey(null))).toBeNull()
  })

  it("restores the draft of a stored seed when its record arrives, keeping the server's branches", () => {
    const { result, rerender } = renderHook(
      ({ record }: { record: SeedRecordDTO | null }) =>
        useSeedForm({ editRecord: record, takenSlugs: [], onClose: vi.fn(), open: record !== null }),
      { initialProps: { record: null as SeedRecordDTO | null } }
    )
    writeDraft(draftKey("article"), {
      formData: { ...seedToFormData(editRecord), label: "Edited", branches: [{ ...branches[1], label: "Headline" }] },
      step: "fields",
      slugTouched: false,
    })

    rerender({ record: editRecord })

    expect(result.current.formData.label).toBe("Edited")
    expect(result.current.step).toBe("fields")
    expect(result.current.isDirty).toBe(true)
    // `body` exists on the server but was missing from the draft: it comes back, the edited label stays.
    expect(result.current.branches.map((b) => b.alias)).toEqual(["body", "title"])
    expect(result.current.branches.find((b) => b.alias === "title")?.label).toBe("Headline")
  })

  it("clears the draft when a discard is confirmed through the router", () => {
    writeDraft(draftKey(null), { formData: seedToFormData(null), step: "general", slugTouched: false })
    const { result } = renderCreate()

    act(() => result.current.discardDraft())

    expect(readDraft(draftKey(null))).toBeNull()
  })
})
