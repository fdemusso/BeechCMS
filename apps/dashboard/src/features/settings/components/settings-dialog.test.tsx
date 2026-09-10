// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
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
vi.mock("@/features/oauth-consent", () => ({ ConnectedAppsTab: () => <div>CONNECTED_APPS_CONTENT</div> }))
vi.mock("@/features/rbac", () => ({
  UsersTab: () => <div>USERS_TAB_CONTENT</div>,
  RolesTab: () => <div>ROLES_TAB_CONTENT</div>,
  InvitationsTab: () => <div>INVITATIONS_TAB_CONTENT</div>,
}))

const mockUsePermissions = vi.fn()
vi.mock("@/features/shared", () => ({
  usePermissions: () => mockUsePermissions(),
}))

function setPermissions(overrides: Partial<ReturnType<typeof basePermissions>> = {}) {
  mockUsePermissions.mockReturnValue({ ...basePermissions(), ...overrides })
}

function basePermissions() {
  return {
    effective: { global: new Set(), byScope: new Map() },
    can: (_permission: string, _scope?: string) => false,
    canAnywhere: (_permission: string) => false,
    canGlobally: (_permission: string) => false,
    isDeveloper: false,
    manageableScopes: [],
    isLoading: false,
  }
}

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
  beforeEach(() => {
    setPermissions()
  })

  it("renders modal container and active tab content", () => {
    renderDialog("profile")
    expect(screen.getByText("PROFILE_TAB_CONTENT")).toBeInTheDocument()
  })

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn()
    renderDialog("profile", vi.fn(), onClose)

    const closeBtn = screen.getByLabelText(/close|chiudi/i)
    fireEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
  })

  it("zero-trust: only the account group renders, and ?tab=users falls back to Profile", () => {
    setPermissions()
    renderDialog("users")
    expect(screen.getByText("PROFILE_TAB_CONTENT")).toBeInTheDocument()
    expect(screen.queryByText("USERS_TAB_CONTENT")).not.toBeInTheDocument()
    expect(screen.queryByText(/Sito|Site/)).not.toBeInTheDocument()
  })

  it("a global manage_users holder sees the Access group and the Site tab", () => {
    setPermissions({ canGlobally: (p: string) => p === "manage_users", canAnywhere: (p: string) => p === "manage_users" })
    renderDialog("general", vi.fn())

    const generalButtons = screen.getAllByRole("button").filter(
      (btn) => btn.textContent?.includes("Sito") || btn.textContent?.includes("Site")
    )
    expect(generalButtons.length).toBeGreaterThan(0)

    const usersButtons = screen.getAllByRole("button").filter((btn) => btn.textContent?.includes("Users"))
    expect(usersButtons.length).toBeGreaterThan(0)
    fireEvent.click(usersButtons[0])
  })

  it("switches tabs when clicking sidebar navigation items", () => {
    setPermissions({ canGlobally: (p: string) => p === "manage_users" })
    const onTabChange = vi.fn()
    renderDialog("profile", onTabChange)

    const generalButtons = screen.getAllByRole("button").filter(
      (btn) => btn.textContent?.includes("Sito") || btn.textContent?.includes("Site")
    )
    expect(generalButtons.length).toBeGreaterThan(0)
    fireEvent.click(generalButtons[0])

    expect(onTabChange).toHaveBeenCalledWith("general")
  })

  it("isDeveloper=false hides Content Types even with every RBAC permission", () => {
    setPermissions({
      isDeveloper: false,
      canGlobally: () => true,
      canAnywhere: () => true,
    })
    renderDialog("profile")
    expect(screen.queryByText(/Content Types/)).not.toBeInTheDocument()
  })
})
