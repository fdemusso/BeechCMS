// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const update = vi.fn().mockResolvedValue(undefined)
const prefs = { contentCreate: true, contentUpdate: true, contentDelete: false, mediaUpload: false }
const state = { isLoading: false }

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("../hooks/use-settings", () => ({
  useNotificationPrefs: () => ({ data: state.isLoading ? undefined : prefs, isLoading: state.isLoading }),
  useUpdateNotificationPrefs: () => ({ mutateAsync: update, isPending: false }),
}))

import { NotificationsTab } from "./notifications-tab"

describe("Notifications markup", () => {
  it("is one titled section with one row per event, in a fixed order", () => {
    render(<NotificationsTab />)
    expect(screen.getByRole("region", { name: "In-app notifications" }).tagName).toBe("SECTION")
    expect(screen.getAllByRole("switch").map((s) => s.id)).toEqual([
      "notif-content-create", "notif-content-update", "notif-content-delete", "notif-media-upload",
    ])
  })

  it("never repeats an id", () => {
    render(<NotificationsTab />)
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("names every switch by its event and reads the explanation as its description", () => {
    render(<NotificationsTab />)
    const create = screen.getByRole("switch", { name: "New content" })
    expect(create).toBeChecked()
    expect(create).toHaveAccessibleDescription("When a new entry is created")
    expect(screen.getByRole("switch", { name: "Content deleted" })).not.toBeChecked()
  })

  it("saves the whole set with the one change, the moment a switch is flipped", () => {
    render(<NotificationsTab />)
    fireEvent.click(screen.getByRole("switch", { name: "Content deleted" }))
    expect(update).toHaveBeenCalledWith({ ...prefs, contentDelete: true })
  })

  it("says it is loading while it is", () => {
    state.isLoading = true
    render(<NotificationsTab />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading")
    state.isLoading = false
  })
})
