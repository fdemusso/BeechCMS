// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"
import type { Branch } from "@beechcms/core"

// ─── Mock @/features/schema ──────────────────────────────────────────────────
vi.mock("@/features/shared", () => ({
  useSchema: vi.fn(),
  useActiveSeed: vi.fn(),
}))

// ─── Mock @/lib/api ───────────────────────────────────────────────────────────
import { useSchema } from "@/features/shared"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import { ApiError } from "@/lib/http/api-error"
import { RelationDisplay } from "@/components/fields/display/relation"
import { RelationEdit } from "@/components/fields/edit/relation"
import { FieldsProvider, type FieldsContextType } from "@/components/fields/context"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

type RelationRecord = Awaited<ReturnType<FieldsContextType["fetchById"]>>

/** Stands in for the content API behind the fields context: `get(url, { params })` answers `{ data }`. */
const get = vi.fn<(url: string, config?: { params: object }) => Promise<{ data: unknown }>>()

const mockFieldsConfig: FieldsContextType = {
  useSchema,
  useLocaleConfig: () => undefined,
  fetchById: async (slug, id) => (await get(`/content/${slug}/${id}`)).data as RelationRecord,
  searchRelations: async (slug, params) =>
    ((await get(`/content/${slug}`, { params: { ...params, page: 1 } })).data as { items: RelationRecord[] }).items,
  queryKeys: { detail: CONTENT_QUERY_KEYS.detail, lists: CONTENT_QUERY_KEYS.lists },
  components: { EntryEditorDialog: () => null, RichtextEditor: () => null },
}

function wrapper(client: QueryClient, primeCache?: () => void) {
  return ({ children }: { children: React.ReactNode }) => {
    primeCache?.()
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FieldsProvider value={mockFieldsConfig}>{children}</FieldsProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

const relationBranch: Branch = {
  id: "br_01",
  alias: "author_id",
  label: "Author",
  type: "relation",
  targetSeed: "team",
} as unknown as Branch

const multiRelationBranch: Branch = {
  id: "br_02",
  alias: "tags",
  label: "Tags",
  type: "relation",
  targetSeed: "team",
  multiple: true,
} as unknown as Branch

const teamSeed = {
  slug: "team",
  label: "Team",
  displayNameAlias: "name",
  branches: [
    { id: "br_01", alias: "name", label: "Name", type: "text" },
  ],
}

const authorEntry = {
  id: "author-1",
  slug: null,
  status: "published",
  data: { name: "Ada Lovelace" },
  created_at: null,
  updated_at: null,
}

// ─── RelationDisplay ─────────────────────────────────────────────────────────

describe("RelationDisplay", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({ data: [teamSeed], isLoading: false })
  })

  it("renders em-dash when value is null", () => {
    render(
      <RelationDisplay branch={relationBranch} value={null} />,
      { wrapper: wrapper(queryClient) }
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders em-dash when value is empty string", () => {
    render(
      <RelationDisplay branch={relationBranch} value="" />,
      { wrapper: wrapper(queryClient) }
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders label from primed cache synchronously", () => {
    // Prime cache before render
    queryClient.setQueryData(
      ["content", "detail", "team", "author-1"],
      authorEntry
    )

    render(
      <RelationDisplay branch={relationBranch} value="author-1" />,
      { wrapper: wrapper(queryClient) }
    )

    // No loading state — resolves from cache
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    const label = screen.getByText("Ada Lovelace")
    expect(label).toBeInTheDocument()
    expect(label).toHaveClass("cursor-pointer")
  })

  it("falls back to id when cache is empty and fetch yields no label", async () => {
    // Simulate fetchById returning entry with no name field
    ;get.mockResolvedValueOnce({
      data: {
        id: "author-1",
        slug: null,
        status: "published",
        data: {},
        created_at: null,
        updated_at: null,
      },
    })

    render(
      <RelationDisplay branch={relationBranch} value="author-1" />,
      { wrapper: wrapper(queryClient) }
    )

    await waitFor(() => {
      // Falls back to id when no label
      expect(screen.getByText("author-1")).toBeInTheDocument()
    })
  })

  it("renders correct label from fetch when cache is empty", async () => {
    ;get.mockResolvedValueOnce({
      data: authorEntry,
    })

    render(
      <RelationDisplay branch={relationBranch} value="author-1" />,
      { wrapper: wrapper(queryClient) }
    )

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    })

    // Verify no extra fetch calls were made after first
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("shows the label again once a target that was in the Trash is restored", async () => {
    get.mockRejectedValueOnce(new ApiError(404, { type: "content-not-found" }))
    render(
      <RelationDisplay branch={relationBranch} value="author-1" />,
      { wrapper: wrapper(queryClient) }
    )
    await waitFor(() => expect(screen.getByText("author-1")).toBeInTheDocument())
    get.mockResolvedValueOnce({ data: authorEntry })

    // What a restore does to the content cache (see invalidateTrashSurfaces).
    queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument())
  })
})

// ─── RelationEdit ─────────────────────────────────────────────────────────────

describe("RelationEdit", () => {
  let queryClient: QueryClient
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({ data: [teamSeed], isLoading: false })
    ;get.mockResolvedValue({
      data: {
        items: [authorEntry, {
          id: "author-2",
          slug: null,
          status: "published",
          data: { name: "Grace Hopper" },
          created_at: null,
          updated_at: null,
        }],
        total: 2,
        page: 1,
        limit: 20,
      },
    })
  })

  it("shows placeholder when no value", () => {
    render(
      <RelationEdit branch={relationBranch} value={null} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )
    expect(screen.getByText("Select a related entry…")).toBeInTheDocument()
  })

  it("shows selected label when value is set and cache primed", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={relationBranch} value="author-1" onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
  })

  it("opens popover and shows results on click", async () => {
    render(
      <RelationEdit branch={relationBranch} value={null} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    const trigger = screen.getByRole("combobox")
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
      expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    })
  })

  it("calls onChange with entry id when an item is selected", async () => {
    render(
      <RelationEdit branch={relationBranch} value={null} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    fireEvent.click(screen.getByRole("combobox"))

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Ada Lovelace"))
    expect(mockOnChange).toHaveBeenCalledWith("author-1")
  })

  it("shows Clear button when value is set and branch is not required", () => {
    const notRequiredBranch = { ...relationBranch, requiredOnUpdate: false } as unknown as Branch
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={notRequiredBranch} value="author-1" onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.getByLabelText("Clear selection")).toBeInTheDocument()
  })

  it("calls onChange(null) when Clear is clicked", () => {
    const notRequiredBranch = { ...relationBranch, requiredOnUpdate: false } as unknown as Branch
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={notRequiredBranch} value="author-1" onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    fireEvent.click(screen.getByLabelText("Clear selection"))
    expect(mockOnChange).toHaveBeenCalledWith(null)
  })

  it("hides Clear button in edit mode when requiredOnUpdate is true", () => {
    const requiredBranch = {
      ...relationBranch,
      requiredOnUpdate: true,
    } as unknown as Branch
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={requiredBranch} value="author-1" onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.queryByLabelText("Clear selection")).not.toBeInTheDocument()
  })

  it("hides Clear button in create mode when requiredOnCreate is true", () => {
    const requiredBranch = {
      ...relationBranch,
      requiredOnCreate: true,
    } as unknown as Branch
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit
        branch={requiredBranch}
        value="author-1"
        onChange={mockOnChange}
        isCreate
      />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.queryByLabelText("Clear selection")).not.toBeInTheDocument()
  })
})

// ─── RelationDisplay — multi-value ────────────────────────────────────────────

describe("RelationDisplay (multiple: true)", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({ data: [teamSeed], isLoading: false })
  })

  it("renders em-dash when value is empty array", () => {
    render(
      <RelationDisplay branch={multiRelationBranch} value={[]} />,
      { wrapper: wrapper(queryClient) }
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders em-dash when value is null", () => {
    render(
      <RelationDisplay branch={multiRelationBranch} value={null} />,
      { wrapper: wrapper(queryClient) }
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows a name badge per primed id when the relation has no avatar source", () => {
    const entry2 = { ...authorEntry, id: "author-2", data: { name: "Grace Hopper" } }
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)
    queryClient.setQueryData(["content", "detail", "team", "author-2"], entry2)

    render(
      <RelationDisplay branch={multiRelationBranch} value={["author-1", "author-2"]} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
  })

  it("renders no avatar for a relation without an avatar source", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationDisplay branch={multiRelationBranch} value={["author-1"]} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(document.querySelector('[data-slot="avatar"]')).toBeNull()
  })

  describe("with an avatar source", () => {
    const teamWithPhoto = {
      ...teamSeed,
      branches: [...teamSeed.branches, { id: "br_03", alias: "photo", label: "Photo", type: "file", fileOptions: { accept: "image" } }],
    }
    const avatarBranch = { ...multiRelationBranch, avatarSource: "photo" } as unknown as Branch

    beforeEach(() => {
      ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({ data: [teamWithPhoto], isLoading: false })
    })

    it("shows the initials of the display name as avatar fallback and no name text", () => {
      queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

      render(
        <RelationDisplay branch={avatarBranch} value={["author-1"]} />,
        { wrapper: wrapper(queryClient) }
      )

      const fallback = screen.getByText("AL")
      expect(fallback).toHaveAttribute("data-slot", "avatar-fallback")
      expect(screen.queryByText("Ada Lovelace")).toBeNull()
    })

    it("falls back to the last two characters of the id when the entry has no display name", () => {
      queryClient.setQueryData(["content", "detail", "team", "author-1"], { ...authorEntry, data: {} })

      render(
        <RelationDisplay branch={avatarBranch} value={["author-1"]} />,
        { wrapper: wrapper(queryClient) }
      )

      expect(screen.getByText("-1")).toHaveAttribute("data-slot", "avatar-fallback")
    })

    it("collapses entries beyond the visible slots into a +N counter", () => {
      for (const n of [1, 2, 3, 4]) {
        queryClient.setQueryData(["content", "detail", "team", `author-${n}`], { ...authorEntry, id: `author-${n}`, data: { name: `Person ${n}` } })
      }

      render(
        <RelationDisplay branch={avatarBranch} value={["author-1", "author-2", "author-3", "author-4"]} options={{ compact: true }} />,
        { wrapper: wrapper(queryClient) }
      )

      expect(screen.getByText("+2")).toBeInTheDocument()
      expect(screen.getAllByText(/^P\d$/)).toHaveLength(2)
    })

    it("does not resolve the overflow entries until the counter is opened", () => {
      for (const n of [1, 2, 3, 4]) {
        queryClient.setQueryData(["content", "detail", "team", `author-${n}`], { ...authorEntry, id: `author-${n}`, data: { name: `Person ${n}` } })
      }

      render(
        <RelationDisplay branch={avatarBranch} value={["author-1", "author-2", "author-3", "author-4"]} options={{ compact: true }} />,
        { wrapper: wrapper(queryClient) }
      )

      expect(queryClient.getQueryCache().find({ queryKey: ["content", "detail", "team", "author-4"] })?.getObserversCount()).toBe(0)
    })
  })
})

// ─── RelationEdit — multi-value ───────────────────────────────────────────────

describe("RelationEdit (multiple: true)", () => {
  let queryClient: QueryClient
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({ data: [teamSeed], isLoading: false })
    ;get.mockResolvedValue({
      data: {
        items: [authorEntry, {
          id: "author-2",
          slug: null,
          status: "published",
          data: { name: "Grace Hopper" },
          created_at: null,
          updated_at: null,
        }],
        total: 2,
        page: 1,
        limit: 20,
      },
    })
  })

  it("renders chips for selected ids from primed cache", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
  })

  it("calls onChange with added id appended to existing array", async () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    const trigger = screen.getByRole("button", { name: "Add…" })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Grace Hopper"))
    expect(mockOnChange).toHaveBeenCalledWith(["author-1", "author-2"])
  })

  it("remove button calls onChange with id removed", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    const removeBtn = screen.getByLabelText("Remove")
    fireEvent.click(removeBtn)
    expect(mockOnChange).toHaveBeenCalledWith([])
  })

  it("keeps already-selected entries in the picker, checked", async () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    fireEvent.click(screen.getByRole("button", { name: "Add…" }))

    await waitFor(() => expect(screen.getByText("Grace Hopper")).toBeInTheDocument())
    const options = screen.getAllByRole("option")
    expect(options.map((option) => [option.textContent, option.getAttribute("aria-selected")])).toEqual([
      ["Ada Lovelace", "true"],
      ["Grace Hopper", "false"],
    ])
  })

  it("clicking a selected entry in the picker removes it", async () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )
    fireEvent.click(screen.getByRole("button", { name: "Add…" }))
    await waitFor(() => expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2))

    fireEvent.click(screen.getAllByText("Ada Lovelace")[1])

    expect(mockOnChange).toHaveBeenCalledWith([])
  })

  it("stays open after a pick and closes with the Done button", async () => {
    render(
      <RelationEdit branch={multiRelationBranch} value={[]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )
    fireEvent.click(screen.getByRole("button", { name: "Add…" }))
    await waitFor(() => expect(screen.getByText("Grace Hopper")).toBeInTheDocument())

    fireEvent.click(screen.getByText("Grace Hopper"))

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument())
  })

  it("shows how many entries are selected and a drag handle per row", () => {
    const entry2 = { ...authorEntry, id: "author-2", data: { name: "Grace Hopper" } }
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)
    queryClient.setQueryData(["content", "detail", "team", "author-2"], entry2)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1", "author-2"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(screen.getByText("2 selected")).toBeInTheDocument()
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(2)
  })

  it("renders no avatar on rows when the relation has no avatar source", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    expect(document.querySelector('[data-slot="avatar"]')).toBeNull()
  })
})
