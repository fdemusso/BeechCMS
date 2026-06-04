// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DeleteSeedDialog } from "@/features/seed-builder/components/DeleteSeedDialog"
import type { SeedRecordDTO } from "@/features/seed-builder"
import type { Seed } from "@beechcms/core"

const mockDelete = vi.fn()

vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useDeleteSeed: () => ({ mutate: mockDelete, isPending: false }),
}))

const mockRecord: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    labelPlural: "Articles",
    displayNameAlias: "title",
    branches: [],
  } as Seed,
  status: "active",
  source: "runtime",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("DeleteSeedDialog", () => {
  it("shows seed label in title", () => {
    wrap(<DeleteSeedDialog seed={mockRecord} open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/Article/i)).toBeDefined()
  })

  it("explains data is retained", () => {
    wrap(<DeleteSeedDialog seed={mockRecord} open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/NOT deleted/i)).toBeDefined()
  })

  it("calls mutate on confirm click", () => {
    wrap(<DeleteSeedDialog seed={mockRecord} open={true} onOpenChange={vi.fn()} />)
    const deleteBtn = screen.getByText(/^Delete$/i)
    fireEvent.click(deleteBtn)
    expect(mockDelete).toHaveBeenCalledWith("article", expect.any(Object))
  })
})
