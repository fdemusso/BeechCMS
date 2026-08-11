// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SettingsDialog } from "./settings-dialog"
import type { SettingsTab } from "../types/settings.types"

// Mock sub-tab components to keep rendering lightweight in UI unit test
vi.mock("./profile-tab", () => ({ ProfileTab: () => <div>PROFILE_TAB_CONTENT</div> }))
vi.mock("./general-tab", () => ({ GeneralTab: () => <div>GENERAL_TAB_CONTENT</div> }))
vi.mock("./interface-tab", () => ({ InterfaceTab: () => <div>INTERFACE_TAB_CONTENT</div> }))
vi.mock("./security-tab", () => ({ SecurityTab: () => <div>SECURITY_TAB_CONTENT</div> }))
vi.mock("./storage-tab", () => ({ StorageTab: () => <div>STORAGE_TAB_CONTENT</div> }))
vi.mock("./notifications-tab", () => ({ NotificationsTab: () => <div>NOTIFICATIONS_TAB_CONTENT</div> }))
vi.mock("@/features/seed-builder", () => ({ SeedBuilderPage: () => <div>SEED_BUILDER_CONTENT</div> }))

const renderDialog = (
  activeTab: SettingsTab = "profile",
  onTabChange = vi.fn(),
  onClose = vi.fn()
) => {
  return render(
    <MemoryRouter>
      <SettingsDialog open={true} onClose={onClose} activeTab={activeTab} onTabChange={onTabChange} />
    </MemoryRouter>
  )
}

describe("SettingsDialog", () => {
  it("renders modal container and active tab content", () => {
    renderDialog("profile")
    expect(screen.getByText("PROFILE_TAB_CONTENT")).toBeInTheDocument()
  })

  it("switches tabs when clicking sidebar navigation items", () => {
    const onTabChange = vi.fn()
    renderDialog("profile", onTabChange)

    const generalButtons = screen.getAllByRole("button").filter(
      (btn) => btn.textContent?.includes("Sito") || btn.textContent?.includes("Site")
    )
    expect(generalButtons.length).toBeGreaterThan(0)
    fireEvent.click(generalButtons[0])

    expect(onTabChange).toHaveBeenCalledWith("general")
  })

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn()
    renderDialog("profile", vi.fn(), onClose)

    const closeBtn = screen.getByLabelText(/close|chiudi/i)
    fireEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
  })
})
