// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SeedBuilderPage } from "@/features/seed-builder"
import type { SeedRecordDTO } from "@/features/seed-builder"
import type { Seed } from "@beechcms/core"

const mockAuthAdmin = { user: { email: "admin@test.com", role: "admin" as const } }
const mockAuthEditor = { user: { email: "editor@test.com", role: "editor" as const } }
const mockAuthRef = { current: mockAuthAdmin }

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
  useCreateSeed: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSeed: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSeed: () => ({ mutate: vi.fn(), isPending: false }),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
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
