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
vi.mock("@/features/schema", () => ({
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

import { useSchema } from "@/features/schema"
import { api } from "@/lib/api"
import { RelationDisplay } from "@/features/fields/display/relation"
import { RelationEdit } from "@/features/fields/edit/relation"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function wrapper(client: QueryClient, primeCache?: () => void) {
  return ({ children }: { children: React.ReactNode }) => {
    primeCache?.()
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
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
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    const link = screen.getByRole("link")
    expect(link).toHaveAttribute("href", "/content/team/author-1")
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
