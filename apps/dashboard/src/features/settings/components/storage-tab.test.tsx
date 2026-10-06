// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("../hooks/use-settings", () => ({ useStorageStats: vi.fn() }))

import { useStorageStats } from "../hooks/use-settings"
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
  beforeEach(() => {
    vi.clearAllMocks()
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
})
