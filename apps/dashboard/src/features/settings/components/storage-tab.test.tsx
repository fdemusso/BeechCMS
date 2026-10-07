// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("../hooks/use-settings", () => ({ useStorageStats: vi.fn(), useDeleteOrphans: vi.fn() }))

import { useDeleteOrphans, useStorageStats } from "../hooks/use-settings"
import { StorageTab } from "./storage-tab"
import type { StorageStats } from "../types/settings.types"

const firstPage: StorageStats = {
  totalBytes: 510,
  fileCount: 51,
  orphanTotal: 51,
  orphanBytes: 510,
  orphanOffset: 0,
  orphanLimit: 50,
  orphans: Array.from({ length: 50 }, (_, index) => ({
    key: `media/file-${50 - index}.png`,
    filename: `file-${50 - index}.png`,
    mime_type: "image/png",
    size_bytes: 10,
    created_at: 50 - index,
  })),
}

describe("StorageTab", () => {
  const deleteOrphans = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDeleteOrphans).mockReturnValue({ mutate: deleteOrphans, isPending: false } as unknown as ReturnType<typeof useDeleteOrphans>)
    vi.mocked(useStorageStats).mockImplementation(offset => ({
      data: offset === 0 ? firstPage : {
        ...firstPage,
        orphanOffset: 50,
        orphans: [{ key: "media/file-0.png", filename: "file-0.png", mime_type: "image/png", size_bytes: 10, created_at: 0 }],
      },
      isLoading: false,
      isError: false,
    }) as ReturnType<typeof useStorageStats>)
  })

  it("loads the next orphan page when the user selects Next", () => {
    render(<StorageTab />)

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(useStorageStats).toHaveBeenLastCalledWith(50)
    expect(screen.getByText("file-0.png")).toBeInTheDocument()
    expect(screen.queryByText("No orphan files found")).not.toBeInTheDocument()
  })

  it("deletes only the reviewed orphans once the user confirms", () => {
    render(<StorageTab />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select file-50.png" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select file-48.png" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete 2 selected" }))

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(deleteOrphans).toHaveBeenCalledTimes(1)
    expect(deleteOrphans.mock.calls[0][0]).toEqual(["media/file-50.png", "media/file-48.png"])
  })

  it("clears the selection when the user changes page, so no unseen key is submitted", () => {
    render(<StorageTab />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select file-50.png" }))

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(screen.queryByRole("button", { name: /selected$/ })).not.toBeInTheDocument()
    expect(deleteOrphans).not.toHaveBeenCalled()
  })
})
