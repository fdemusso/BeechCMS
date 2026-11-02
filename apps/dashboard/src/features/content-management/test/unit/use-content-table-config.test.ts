// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

import { useContentTableConfig } from "@/features/content-management/hooks/use-content-table-config"
import type { ContentEntry } from "@/lib/dynamic-columns"

vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts") as Seed

function entry(id: string, priority: string[]): ContentEntry {
  return { id, slug: id, data: { title: id, priority }, status: "draft", created_at: 0, updated_at: 0 } as ContentEntry
}

function renderConfig(data: ContentEntry[], groupBy: string | null) {
  return renderHook(() =>
    useContentTableConfig({
      seed: posts,
      data,
      pageSize: 25,
      layout: {
        groupBy,
        setGroupBy: vi.fn(),
        dateGroupPrecision: { year: true, month: true, day: false },
      },
      selectedIds: [],
      handleEdit: vi.fn(),
      handleDelete: vi.fn(),
      handleBulkDelete: vi.fn(),
      handleBulkEdit: vi.fn(),
      t: (key) => key,
    })
  )
}

describe("useContentTableConfig", () => {
  it("orders rows by option position when grouping by a single-choice tags branch", () => {
    const data = [entry("e-high", ["high"]), entry("e-empty", []), entry("e-low", ["low"])]

    const { result } = renderConfig(data, "priority")

    expect(result.current.rows.map((row) => row.id)).toEqual(["e-low", "e-high", "e-empty"])
  })

  it("returns data unchanged when grouping by a non-tags column", () => {
    const data = [entry("e-high", ["high"]), entry("e-low", ["low"])]

    const { result } = renderConfig(data, "title")

    expect(result.current.rows).toBe(data)
  })
})
