// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SeedEditorDialog } from "@/features/seed-builder/components/SeedEditorDialog"
import type { SeedRecordDTO } from "@/features/seed-builder"
import type { Seed } from "@beechcms/core"

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock("@/features/seed-builder/hooks/use-seeds", () => ({
  useCreateSeed: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateSeed: () => ({ mutate: mockUpdate, isPending: false }),
  useDeleteSeed: () => ({ mutate: vi.fn(), isPending: false }),
}))

const existingRecord: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    labelPlural: "Articles",
    displayNameAlias: "title",
    branches: [
      { id: "br_01", alias: "title", label: "Title", type: "text" },
      { id: "br_02", alias: "body", label: "Body", type: "richtext" },
    ],
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

describe("SeedEditorDialog — create mode", () => {
  it("renders create title", () => {
    wrap(<SeedEditorDialog open={true} onOpenChange={vi.fn()} activeSeedsForRelation={[]} />)
    expect(screen.getByText(/New content type/i)).toBeDefined()
  })

  it("slug input is editable in create mode", () => {
    wrap(<SeedEditorDialog open={true} onOpenChange={vi.fn()} activeSeedsForRelation={[]} />)
    const slugInput = screen.getByPlaceholderText("content_type")
    expect((slugInput as HTMLInputElement).readOnly).toBe(false)
  })
})

describe("SeedEditorDialog — edit mode", () => {
  it("renders edit title with seed label", () => {
    wrap(
      <SeedEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        editRecord={existingRecord}
        activeSeedsForRelation={[]}
      />
    )
    expect(screen.getByText(/Article/i)).toBeDefined()
  })

  it("slug input is read-only when editing", () => {
    wrap(
      <SeedEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        editRecord={existingRecord}
        activeSeedsForRelation={[]}
      />
    )
    const slugInput = screen.getByDisplayValue("article") as HTMLInputElement
    expect(slugInput.readOnly).toBe(true)
  })
})
