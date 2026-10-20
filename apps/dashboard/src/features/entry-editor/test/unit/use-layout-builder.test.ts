// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLayoutBuilder, getFullWidthWarningLabel } from "@/features/entry-editor/builder/use-layout-builder"
import type { Seed, FormLayout } from "@beechcms/core"

const mockSeed: Seed = {
  slug: "posts",
  label: "Post",
  labelPlural: "Posts",
  allowDrafts: true,
  branches: [
    { id: "b-title", alias: "title", label: "Title", type: "text", required: true },
    { id: "b-content", alias: "content", label: "Content", type: "text" },
    { id: "b-published", alias: "published", label: "Published", type: "boolean" },
    { id: "b-seo", alias: "seo", label: "SEO Description", type: "text" },
    { id: "b-gallery", alias: "gallery", label: "Gallery", type: "file", multiple: true }, // Full width mock field
    { id: "b-json", alias: "metadata", label: "Metadata", type: "json" },
  ],
} as any

const mockInitialLayout: FormLayout = {
  version: 1,
  tabs: [
    {
      id: "tab-main",
      label: "Main Content",
      sections: [
        {
          id: "sec-general",
          label: "General Info",
          hideLabel: false,
          hideBorder: false,
          collapsible: false,
          columns: [
            {
              id: "col-left",
              fields: [
                { branchId: "b-title" },
              ],
            },
            {
              id: "col-right",
              fields: [
                { branchId: "b-content" },
              ],
            },
          ],
        },
      ],
    },
  ],
}

describe("useLayoutBuilder", () => {
  it("initializes layout, storedState, and isDirty status correctly", () => {
    const { result } = renderHook(() =>
      useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
    )

    expect(result.current.draft).toEqual(mockInitialLayout)
    expect(result.current.isDirty).toBe(false)
    expect(result.current.activeTabId).toBe("tab-main")
  })

  describe("Tab operations", () => {
    it("adds, renames, reorders, and removes tabs", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      // Add Tab
      act(() => {
        result.current.addTab()
      })
      expect(result.current.draft.tabs).toHaveLength(2)
      expect(result.current.draft.tabs[1].label).toBe("New Tab")
      expect(result.current.isDirty).toBe(true)

      const secondTabId = result.current.draft.tabs[1].id

      // Rename Tab
      act(() => {
        result.current.renameTab(secondTabId, "SEO Settings")
      })
      expect(result.current.draft.tabs[1].label).toBe("SEO Settings")

      // Reorder Tabs
      act(() => {
        result.current.reorderTabs(0, 1)
      })
      expect(result.current.draft.tabs[0].id).toBe(secondTabId)

      // Remove Tab
      act(() => {
        result.current.removeTab(secondTabId)
      })
      expect(result.current.draft.tabs).toHaveLength(1)
      expect(result.current.draft.tabs[0].id).toBe("tab-main")
    })

    it("does not remove the last remaining tab", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      act(() => {
        result.current.removeTab("tab-main")
      })
      expect(result.current.draft.tabs).toHaveLength(1)
    })
  })

  describe("Section operations", () => {
    it("adds, renames, configures column count, toggles flags, and removes sections", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      // Add Section
      act(() => {
        result.current.addSection("tab-main", 3)
      })
      expect(result.current.draft.tabs[0].sections).toHaveLength(2)
      const newSec = result.current.draft.tabs[0].sections[1]
      expect(newSec.columns).toHaveLength(3)

      const newSecId = newSec.id

      // Rename Section
      act(() => {
        result.current.renameSection("tab-main", newSecId, "Advanced")
      })
      expect(result.current.draft.tabs[0].sections[1].label).toBe("Advanced")

      // Toggle Section Flags
      act(() => {
        result.current.toggleSectionFlag("tab-main", newSecId, "hideLabel")
        result.current.toggleSectionFlag("tab-main", newSecId, "hideBorder")
        result.current.toggleSectionFlag("tab-main", newSecId, "collapsible")
      })
      const modifiedSec = result.current.draft.tabs[0].sections[1]
      expect(modifiedSec.hideLabel).toBe(true)
      expect(modifiedSec.hideBorder).toBe(true)
      expect(modifiedSec.collapsible).toBe(true)

      // Change column count (expand from 3 to 4)
      act(() => {
        result.current.setSectionColumnCount("tab-main", newSecId, 4)
      })
      expect(result.current.draft.tabs[0].sections[1].columns).toHaveLength(4)

      // Change column count (shrink from 4 to 2)
      act(() => {
        result.current.setSectionColumnCount("tab-main", newSecId, 2)
      })
      expect(result.current.draft.tabs[0].sections[1].columns).toHaveLength(2)

      // Reorder Sections
      act(() => {
        result.current.reorderSections("tab-main", 0, 1)
      })
      expect(result.current.draft.tabs[0].sections[0].id).toBe(newSecId)

      // Remove Section
      act(() => {
        result.current.removeSection("tab-main", newSecId)
      })
      expect(result.current.draft.tabs[0].sections).toHaveLength(1)
      expect(result.current.draft.tabs[0].sections[0].id).toBe("sec-general")
    })
  })

  describe("Column operations", () => {
    it("reorders columns in a section", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      const colLeftId = result.current.draft.tabs[0].sections[0].columns[0].id
      const colRightId = result.current.draft.tabs[0].sections[0].columns[1].id

      act(() => {
        result.current.reorderColumns("tab-main", "sec-general", 0, 1)
      })

      expect(result.current.draft.tabs[0].sections[0].columns[0].id).toBe(colRightId)
      expect(result.current.draft.tabs[0].sections[0].columns[1].id).toBe(colLeftId)
    })
  })

  describe("Field operations", () => {
    it("assigns, clears, reorders and moves fields", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      // Assign Field
      let assignOk = false
      act(() => {
        assignOk = result.current.assignField("tab-main", "sec-general", "col-left", "b-published")
      })
      expect(assignOk).toBe(true)
      expect(result.current.draft.tabs[0].sections[0].columns[0].fields).toEqual([
        { branchId: "b-title" },
        { branchId: "b-published" },
      ])

      // Reorder Fields in Column
      act(() => {
        result.current.reorderFieldsInColumn("tab-main", "sec-general", "col-left", 0, 1)
      })
      expect(result.current.draft.tabs[0].sections[0].columns[0].fields).toEqual([
        { branchId: "b-published" },
        { branchId: "b-title" },
      ])

      // Move Field to another column
      let moveOk = false
      act(() => {
        moveOk = result.current.moveField({
          from: { tabId: "tab-main", sectionId: "sec-general", columnId: "col-left", branchId: "b-published" },
          to: { tabId: "tab-main", sectionId: "sec-general", columnId: "col-right" },
        })
      })
      expect(moveOk).toBe(true)
      expect(result.current.draft.tabs[0].sections[0].columns[0].fields).toEqual([
        { branchId: "b-title" },
      ])
      expect(result.current.draft.tabs[0].sections[0].columns[1].fields).toEqual([
        { branchId: "b-content" },
        { branchId: "b-published" },
      ])

      // Clear Field
      act(() => {
        result.current.clearField("tab-main", "sec-general", "col-right", "b-published")
      })
      expect(result.current.draft.tabs[0].sections[0].columns[1].fields).toEqual([
        { branchId: "b-content" },
      ])
    })

    it("respects full-width constraints and rejects layouts violating them", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      // gallery is an asset list branch (multiple: true), which under the default mock implementation
      // of isFullWidthBranch evaluates to true.
      // Rejects placing a full-width field in a section that already contains fields (sec-general has title/content)
      let assignOk = true
      act(() => {
        assignOk = result.current.assignField("tab-main", "sec-general", "col-left", "b-gallery")
      })
      expect(assignOk).toBe(false)
    })

    it("rejects assigning a json branch into a multi-column section", () => {
      const layoutWithEmptyMultiCol: FormLayout = {
        version: 1,
        tabs: [
          {
            id: "tab-main",
            label: "Main",
            sections: [
              {
                id: "sec-empty-2col",
                columns: [
                  { id: "col-1", fields: [] },
                  { id: "col-2", fields: [] },
                ],
              },
            ],
          },
        ],
      }
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: layoutWithEmptyMultiCol })
      )

      let assignOk = true
      act(() => {
        assignOk = result.current.assignField("tab-main", "sec-empty-2col", "col-1", "b-json")
      })
      expect(assignOk).toBe(false)
    })

    it("rejects assigning a non-full-width branch into a section containing a json branch", () => {
      const layoutWithJson: FormLayout = {
        version: 1,
        tabs: [
          {
            id: "tab-main",
            label: "Main",
            sections: [
              {
                id: "sec-json",
                columns: [
                  { id: "col-1", fields: [{ branchId: "b-json" }] },
                ],
              },
            ],
          },
        ],
      }
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: layoutWithJson })
      )

      let assignOk = true
      act(() => {
        assignOk = result.current.assignField("tab-main", "sec-json", "col-1", "b-published")
      })
      expect(assignOk).toBe(false)
    })

    it("refuses to increase column count beyond 1 for a section containing a json branch", () => {
      const layoutWithJson: FormLayout = {
        version: 1,
        tabs: [
          {
            id: "tab-main",
            label: "Main",
            sections: [
              {
                id: "sec-json",
                columns: [
                  { id: "col-1", fields: [{ branchId: "b-json" }] },
                ],
              },
            ],
          },
        ],
      }
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: layoutWithJson })
      )

      act(() => {
        result.current.setSectionColumnCount("tab-main", "sec-json", 2)
      })
      expect(result.current.draft.tabs[0].sections[0].columns).toHaveLength(1)

      act(() => {
        result.current.setSectionColumnCount("tab-main", "sec-json", 3)
      })
      expect(result.current.draft.tabs[0].sections[0].columns).toHaveLength(1)
    })
  })

  describe("Helper methods", () => {
    it("returns correctly used and available branch list", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      const used = result.current.getUsedBranchIds()
      expect(used.has("b-title")).toBe(true)
      expect(used.has("b-content")).toBe(true)
      expect(used.has("b-seo")).toBe(false)

      const available = result.current.getAvailableBranches()
      const availableAliases = available.map((b) => b.alias)
      expect(availableAliases).toContain("published")
      expect(availableAliases).toContain("seo")
      expect(availableAliases).not.toContain("title")
    })

    it("resets and replaces layouts", () => {
      const { result } = renderHook(() =>
        useLayoutBuilder({ seed: mockSeed, initialLayout: mockInitialLayout })
      )

      // Replace layout
      const customLayout: FormLayout = { version: 1, tabs: [{ id: "tab-new", label: "New", sections: [] }] }
      act(() => {
        result.current.replace(customLayout)
      })
      expect(result.current.draft).toEqual(customLayout)
      expect(result.current.activeTabId).toBe("tab-new")

      // Reset layout (back to seed defaults)
      act(() => {
        result.current.reset()
      })
      expect(result.current.draft.tabs).toHaveLength(2)
      expect(result.current.activeTabId).not.toBe("tab-new")
    })
  })

  describe("getFullWidthWarningLabel", () => {
    it("returns incoming branch label if incoming branch is full-width", () => {
      const galleryBranch = mockSeed.branches.find((b) => b.id === "b-gallery")!
      const sec = mockInitialLayout.tabs[0].sections[0]
      const branchById = Object.fromEntries(mockSeed.branches.map((b) => [b.id, b]))

      const label = getFullWidthWarningLabel(galleryBranch, sec, branchById)
      expect(label).toBe("Gallery")
    })

    it("scans target section and returns existing full-width field label if incoming branch is normal", () => {
      const normalBranch = mockSeed.branches.find((b) => b.id === "b-published")!
      const branchById = Object.fromEntries(mockSeed.branches.map((b) => [b.id, b]))
      const sectionWithGallery: FormLayout["tabs"][0]["sections"][0] = {
        id: "sec-with-gallery",
        columns: [
          { id: "c1", fields: [{ branchId: "b-gallery" }] },
        ],
      }

      const label = getFullWidthWarningLabel(normalBranch, sectionWithGallery, branchById)
      expect(label).toBe("Gallery")
    })

    it("safely handles prototype pollution and reserved keys like constructor or toString", () => {
      const normalBranch = mockSeed.branches.find((b) => b.id === "b-published")!
      const pollutionSection: FormLayout["tabs"][0]["sections"][0] = {
        id: "sec-proto",
        columns: [
          { id: "c1", fields: [{ branchId: "constructor" }, { branchId: "toString" }] },
        ],
      }
      const branchById = Object.fromEntries(mockSeed.branches.map((b) => [b.id, b]))

      // Should not throw or crash on prototype properties
      const label = getFullWidthWarningLabel(normalBranch, pollutionSection, branchById)
      expect(label).toBe("Published")
    })
  })
})
