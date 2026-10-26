// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

vi.mock("@/features/shared", () => ({
  useLocalizeEntryData: () => (_seed: Seed, data: Record<string, unknown>) => data,
}))

import type { ContentEntry } from "@/lib/dynamic-columns"
import { ContentTrashView, type ContentTrashViewProps } from "../../components/ContentTrashView"

const SECONDS_PER_DAY = 86_400
const NOW_SECONDS = 1_800_000_000

const ENTRY_A = "5b0a6b3e-2f4e-4c1a-9a53-0c9d3f1e7a01"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts") as Seed

// Deleted 4 days before `NOW_SECONDS`.
const trashedEntry: ContentEntry = {
  id: ENTRY_A,
  schema_slug: posts.slug,
  slug: null,
  status: "published",
  data: { title: "Canonical Post" },
  created_at: NOW_SECONDS - 10 * SECONDS_PER_DAY,
  updated_at: NOW_SECONDS - 10 * SECONDS_PER_DAY,
  deleted_at: NOW_SECONDS - 4 * SECONDS_PER_DAY,
}

function renderTrashView(overrides: Partial<ContentTrashViewProps>) {
  return render(
    <ContentTrashView
      seed={posts}
      data={[trashedEntry]}
      nowSeconds={NOW_SECONDS}
      retentionDays={undefined}
      rowSelection={{}}
      onRowSelectionChange={vi.fn()}
      selectedIds={[]}
      pageIndex={0}
      onPageIndexChange={vi.fn()}
      pageSize={20}
      pageCount={1}
      totalRows={1}
      canRestore
      canPurge
      isMutating={false}
      onRestore={vi.fn()}
      onPurge={vi.fn()}
      onBulkRestore={vi.fn()}
      onBulkPurge={vi.fn()}
      {...overrides}
    />,
  )
}

describe("ContentTrashView", () => {
  it("shows the days left computed from the retentionDays prop, ignoring the seed's own retentionDays", () => {
    renderTrashView({ seed: { ...posts, retentionDays: 30 }, retentionDays: 14 })

    expect(screen.getByText("10 days left")).toBeInTheDocument()
  })

  it("shows neverPurged when retentionDays is 0", () => {
    renderTrashView({ retentionDays: 0 })

    expect(screen.getByText("Kept indefinitely")).toBeInTheDocument()
    expect(screen.queryByText(/days left/)).not.toBeInTheDocument()
  })

  it("shows the muted dash while retentionDays is undefined", () => {
    renderTrashView({ retentionDays: undefined })

    expect(screen.queryByText(/days left/)).not.toBeInTheDocument()
    expect(screen.queryByText("Kept indefinitely")).not.toBeInTheDocument()
    expect(document.querySelector("td .text-muted-foreground")).toHaveTextContent("—")
  })
})
