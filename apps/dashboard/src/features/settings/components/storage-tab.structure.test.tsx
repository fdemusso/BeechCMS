// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { StorageStats } from "../types/settings.types"
import { SETTINGS_ENTRIES } from "../lib/settings-registry"

const GB = 1024 * 1024 * 1024
const stats: StorageStats = {
  totalBytes: 5 * GB, // half of the 10 GB allowance
  limitBytes: 10 * GB,
  fileCount: 8,
  orphanTotal: 9,
  orphanBytes: 9_000,
  orphanOffset: 0,
  orphanLimit: 6, // a page of six: more than the five rows that show, fewer than the nine there are
  orphans: Array.from({ length: 6 }, (_, i) => ({
    key: `media/file-${i}.png`, filename: `file-${i}.png`, mime_type: "image/png", size_bytes: 1000, uploaded_by: "u1", created_at: i,
  })),
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("../hooks/use-settings", () => ({
  useStorageStats: () => ({ data: stats, isLoading: false, isError: false }),
  useDeleteOrphans: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { StorageTab } from "./storage-tab"

describe("Storage markup", () => {
  it("is the sections of the sidebar bookmarks, in the same order, each opened by one heading", () => {
    render(<StorageTab />)
    const bookmarks = SETTINGS_ENTRIES.find((entry) => entry.id === "storage")!.sections.map((section) => section.id)
    expect(Array.from(document.querySelectorAll("section")).map((s) => s.id.replace("settings-section-", ""))).toEqual(bookmarks)
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Storage usage", "Orphan files"])
  })

  it("never repeats an id", () => {
    render(<StorageTab />)
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("states what is stored as terms and values of a description list", () => {
    const { container } = render(<StorageTab />)
    const terms = Array.from(container.querySelectorAll("dt")).map((dt) => dt.textContent)
    expect(terms).toEqual(["Space used", "Files stored", "Orphan files"])
    expect(container.querySelector("dl")).toHaveTextContent("5.00 GB")
    expect(container.querySelector("dl")).toHaveTextContent("8 total files")
  })

  it("says what the bar is measured against: a free allowance of the plan, not a size R2 has", () => {
    render(<StorageTab />)
    expect(screen.getByText(/R2 has no size cap of its own: 10 GB is the monthly free allowance/)).toBeInTheDocument()
  })

  it("gives the bar a name and a value, so it says more than its width", () => {
    render(<StorageTab />)
    const bar = screen.getByRole("progressbar", { name: "Share of the free allowance (10 GB)" })
    expect(bar).toHaveAttribute("aria-valuenow", "50")
  })

  it("lists the orphans in a named table with its columns named, the checkbox column named for screen readers", () => {
    render(<StorageTab />)
    const table = screen.getByRole("table", { name: "Orphan files" })
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Select", "File", "Type", "Size"])
    expect(within(table).getAllByRole("checkbox")).toHaveLength(stats.orphans.length)
    expect(within(table).getByRole("checkbox", { name: "Select file-0.png" })).toBeInTheDocument()
  })

  it("shows five orphans, then scrolls them in a shadcn ScrollArea under a header that stays put", () => {
    render(<StorageTab />)
    const table = screen.getByRole("table", { name: "Orphan files" })
    const scroller = table.closest('[data-slot="scroll-area"]') as HTMLElement
    expect(scroller.style.maxHeight).toBe("20rem")
    expect(within(scroller).getByRole("group", { name: "Orphan files" })).toHaveAttribute("tabindex", "0")
    expect(table.querySelector("thead")).toHaveClass("sticky", "top-0")
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) expect(row).toHaveClass("h-14")
  })

  it("pages through the orphans in a named navigation that announces where it is", () => {
    render(<StorageTab />)
    const nav = screen.getByRole("navigation", { name: "Pages of orphan files" })
    expect(within(nav).getByRole("button", { name: "Previous" })).toBeDisabled()
    expect(within(nav).getByRole("button", { name: "Next" })).toBeEnabled()
    expect(within(nav).getByRole("status")).toHaveTextContent("1–6 of 9")
  })
})
