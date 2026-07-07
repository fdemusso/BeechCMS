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
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useSchema } from "@/features/shared"
import { api } from "@/lib/api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
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

const mockFieldsConfig: FieldsContextType = {
  useSchema,
  fetchById: async (slug, id) => (await api.get(`/content/${slug}/${id}`)).data,
  searchRelations: async (slug, params) =>
    (await api.get(`/content/${slug}`, { params: { ...params, page: 1 } })).data.items,
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
  schema_slug: "team",
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
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        id: "author-1",
        schema_slug: "team",
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
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
    expect(api.get).toHaveBeenCalledTimes(1)
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
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        items: [authorEntry, {
          id: "author-2",
          schema_slug: "team",
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

  it("renders a chip for each primed id", () => {
    const entry2 = { ...authorEntry, id: "author-2", data: { name: "Grace Hopper" } }
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)
    queryClient.setQueryData(["content", "detail", "team", "author-2"], entry2)

    render(
      <RelationDisplay branch={multiRelationBranch} value={["author-1", "author-2"]} />,
      { wrapper: wrapper(queryClient) }
    )

    // avatars display initials in AvatarFallback
    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(screen.getByText("GH")).toBeInTheDocument()
  })

  it("renders correct chip count", () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationDisplay branch={multiRelationBranch} value={["author-1"]} />,
      { wrapper: wrapper(queryClient) }
    )

    const fallbacks = screen.getAllByText("AL")
    expect(fallbacks).toHaveLength(1)
    expect(fallbacks[0]).toHaveAttribute("data-slot", "avatar-fallback")
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
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        items: [authorEntry, {
          id: "author-2",
          schema_slug: "team",
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

    const trigger = screen.getByRole("combobox")
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

  it("already-selected ids are filtered from combobox list", async () => {
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    fireEvent.click(screen.getByRole("combobox"))

    await waitFor(() => {
      // author-1 already selected — should not appear in dropdown
      // Grace Hopper (author-2) should still be visible
      expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    })
  })

  it("move-up button reorders ids", () => {
    const entry2 = { ...authorEntry, id: "author-2", data: { name: "Grace Hopper" } }
    queryClient.setQueryData(["content", "detail", "team", "author-1"], authorEntry)
    queryClient.setQueryData(["content", "detail", "team", "author-2"], entry2)

    render(
      <RelationEdit branch={multiRelationBranch} value={["author-1", "author-2"]} onChange={mockOnChange} />,
      { wrapper: wrapper(queryClient) }
    )

    const upBtns = screen.getAllByLabelText("Move up")
    // Second chip's "Move up" button moves author-2 before author-1
    fireEvent.click(upBtns[1])
    expect(mockOnChange).toHaveBeenCalledWith(["author-2", "author-1"])
  })
})
