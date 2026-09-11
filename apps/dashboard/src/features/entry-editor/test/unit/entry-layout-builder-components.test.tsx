// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { Seed, Branch } from "@beechcms/core"
import { toast } from "sonner"
import { ColumnCard } from "@/features/entry-editor/builder/column-card"
import type { UseLayoutBuilderResult } from "@/features/entry-editor/builder/use-layout-builder"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: () => null,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <div role="option" onClick={() => onSelect?.()}>{children}</div>
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === "layoutBuilder.warnFullWidth") {
        return `${options?.label ?? ""} requires a dedicated full-width section.`
      }
      return key
    },
  }),
}))

const mockSeed: Seed = {
  slug: "posts",
  label: "Post",
  labelPlural: "Posts",
  allowDrafts: true,
  branches: [
    { id: "b-title", alias: "title", label: "Title", type: "text", required: true },
    { id: "b-published", alias: "published", label: "Published", type: "boolean" },
    { id: "b-gallery", alias: "gallery", label: "Gallery", type: "file", multiple: true },
  ],
} as any

const branchById: Record<string, Branch> = Object.fromEntries(
  mockSeed.branches.map((b) => [b.id, b])
)

describe("ColumnCard UI component feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("closes dropdown and triggers warning toast with accurate full-width label when assignField fails for full-width field", () => {
    const mockOps: Partial<UseLayoutBuilderResult> = {
      assignField: vi.fn().mockReturnValue(false),
      draft: {
        version: 1,
        tabs: [
          {
            id: "t1",
            label: "Tab 1",
            sections: [
              {
                id: "s1",
                columns: [
                  { id: "c1", fields: [{ branchId: "b-title" }] },
                ],
              },
            ],
          },
        ],
      },
    }

    render(
      <ColumnCard
        tabId="t1"
        sectionId="s1"
        columnId="c1"
        fields={[{ branchId: "b-title" }]}
        branchById={branchById}
        availableBranches={[branchById["b-gallery"]]}
        ops={mockOps as UseLayoutBuilderResult}
        dragId="col:t1:s1:c1"
      />
    )

    const addButton = screen.getByText("layoutBuilder.addField")
    fireEvent.click(addButton)

    const galleryOption = screen.getByText("Gallery")
    fireEvent.click(galleryOption)

    expect(mockOps.assignField).toHaveBeenCalledWith("t1", "s1", "c1", "b-gallery")
    expect(toast.warning).toHaveBeenCalledWith("Gallery requires a dedicated full-width section.")
  })

  it("closes dropdown and triggers warning toast with target full-width field label when assignField fails for normal field", () => {
    const mockOps: Partial<UseLayoutBuilderResult> = {
      assignField: vi.fn().mockReturnValue(false),
      draft: {
        version: 1,
        tabs: [
          {
            id: "t1",
            label: "Tab 1",
            sections: [
              {
                id: "s1",
                columns: [
                  { id: "c1", fields: [{ branchId: "b-gallery" }] },
                ],
              },
            ],
          },
        ],
      },
    }

    render(
      <ColumnCard
        tabId="t1"
        sectionId="s1"
        columnId="c1"
        fields={[{ branchId: "b-gallery" }]}
        branchById={branchById}
        availableBranches={[branchById["b-published"]]}
        ops={mockOps as UseLayoutBuilderResult}
        dragId="col:t1:s1:c1"
      />
    )

    const addButton = screen.getByText("layoutBuilder.addField")
    fireEvent.click(addButton)

    const publishedOption = screen.getByText("Published")
    fireEvent.click(publishedOption)

    expect(mockOps.assignField).toHaveBeenCalledWith("t1", "s1", "c1", "b-published")
    expect(toast.warning).toHaveBeenCalledWith("Gallery requires a dedicated full-width section.")
  })
})
