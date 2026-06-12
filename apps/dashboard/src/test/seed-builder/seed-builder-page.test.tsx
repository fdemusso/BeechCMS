// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SeedBuilderPage } from "@/features/seed-builder"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SeedRecordDTO } from "@/features/seed-builder"
import type { Seed } from "@beechcms/core"

const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() }

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => mockBlocker,
}))

const mockAuthAdmin = { user: { email: "admin@test.com", role: "admin" as const } }
const mockAuthEditor = { user: { email: "editor@test.com", role: "editor" as const } }
const mockAuthRef = { current: mockAuthAdmin as { user: { email: string; role: "admin" | "editor" } } }

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockAuthRef.current,
}))

vi.mock("@/features/schema", () => ({
  useSchema: () => ({ data: [] }),
}))

const mockRecord: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    labelPlural: "Articles",
    displayNameAlias: "title",
    branches: [{ id: "br_01", alias: "title", label: "Title", type: "text" }],
  } as Seed,
  status: "active",
  source: "runtime",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockUseSeeds = vi.fn().mockReturnValue({ data: [mockRecord], isLoading: false, refetch: vi.fn() })

vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useSeeds: (...args: unknown[]) => mockUseSeeds(...args),
  useCreateSeed: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSeed: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSeed: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useHardDeleteSeed: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDropBranch: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRenameBranch: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRetypeBranch: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRebuildFts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useOrphans: () => ({ data: { orphans: [] }, refetch: vi.fn(), isFetching: false }),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {ui}
      </TooltipProvider>
    </QueryClientProvider>
  )
}

describe("SeedBuilderPage — admin", () => {
  it("renders content types from useSeeds", () => {
    mockAuthRef.current = mockAuthAdmin
    wrap(<SeedBuilderPage />)
    expect(screen.getByText("Article")).toBeDefined()
    expect(screen.getByText("article")).toBeDefined()
  })

  it("shows New content type button for admin", () => {
    mockAuthRef.current = mockAuthAdmin
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.getByText(/New content type/i)).toBeDefined()
    unmount()
  })

  it("shows source badge as Created here for runtime seed", () => {
    mockAuthRef.current = mockAuthAdmin
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.getByText(/Created here/i)).toBeDefined()
    unmount()
  })

  it("shows edit and delete buttons for admin", () => {
    mockAuthRef.current = mockAuthAdmin
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.getAllByTestId("edit-seed-btn").length).toBeGreaterThan(0)
    expect(screen.getAllByTestId("delete-seed-btn").length).toBeGreaterThan(0)
    unmount()
  })

  it("opens the shared SchemaFormShell (create title) when New content type is clicked", async () => {
    mockAuthRef.current = mockAuthAdmin
    const { unmount } = wrap(<SeedBuilderPage />)
    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()

    await user.click(screen.getByText(/New content type/i))

    // The dialog title duplicates the trigger button's label ("New content type"),
    // and "Fields" duplicates the table's branches column header — query by role
    // to land on the dialog's heading/tabs rather than the page chrome behind it.
    expect(await screen.findByRole("heading", { name: "New content type" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Fields" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument()
    unmount()
  })

  it("opens the shared SchemaFormShell (edit title) when a row's edit button is clicked", async () => {
    mockAuthRef.current = mockAuthAdmin
    const { unmount } = wrap(<SeedBuilderPage />)
    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()

    await user.click(screen.getAllByTestId("edit-seed-btn")[0])

    expect(await screen.findByText('Edit — Article')).toBeInTheDocument()
    unmount()
  })

  it("renders loading state when isLoading is true", () => {
    mockAuthRef.current = mockAuthAdmin
    mockUseSeeds.mockReturnValueOnce({ data: [], isLoading: true, refetch: vi.fn() })
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.getByText("Loading...")).toBeInTheDocument()
    unmount()
  })

  it("renders empty state when there are no results", () => {
    mockAuthRef.current = mockAuthAdmin
    mockUseSeeds.mockReturnValueOnce({ data: [], isLoading: false, refetch: vi.fn() })
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.getByText("No results")).toBeInTheDocument()
    unmount()
  })

  it("toggles showDeleted switch to display deleted content types", async () => {
    mockAuthRef.current = mockAuthAdmin
    const deletedRecord: SeedRecordDTO = {
      slug: "deleted-type",
      definition: {
        slug: "deleted-type",
        label: "Deleted Type",
        labelPlural: "Deleted Types",
        displayNameAlias: "name",
        branches: [],
      } as Seed,
      status: "deleted",
      source: "runtime",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    mockUseSeeds.mockReturnValue({ data: [mockRecord, deletedRecord], isLoading: false, refetch: vi.fn() })
    const { unmount } = wrap(<SeedBuilderPage />)

    expect(screen.queryByText("Deleted Type")).toBeNull()

    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()

    const showDeletedSwitch = screen.getByLabelText(/Show deleted/i)
    await user.click(showDeletedSwitch)

    expect(screen.getByText("Deleted Type")).toBeInTheDocument()
    
    // Restore default mock
    mockUseSeeds.mockReturnValue({ data: [mockRecord], isLoading: false, refetch: vi.fn() })
    unmount()
  })

  it("calls refetch when the refresh button is clicked", async () => {
    mockAuthRef.current = mockAuthAdmin
    const refetchSpy = vi.fn()
    mockUseSeeds.mockReturnValueOnce({ data: [mockRecord], isLoading: false, refetch: refetchSpy })
    const { unmount } = wrap(<SeedBuilderPage />)

    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()

    const refreshBtn = screen.getByTitle("Retry")
    await user.click(refreshBtn)

    expect(refetchSpy).toHaveBeenCalled()
    unmount()
  })
})

describe("SeedBuilderPage — editor", () => {
  it("hides create/edit/delete for non-admin", () => {
    mockAuthRef.current = mockAuthEditor
    const { unmount } = wrap(<SeedBuilderPage />)
    expect(screen.queryByText(/New content type/i)).toBeNull()
    expect(screen.queryByTestId("edit-seed-btn")).toBeNull()
    expect(screen.queryByTestId("delete-seed-btn")).toBeNull()
    unmount()
  })
})
