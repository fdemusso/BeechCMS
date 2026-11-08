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
vi.mock("@/lib/api", () => ({ logout: vi.fn() }))
vi.mock("./notifications-tab", () => ({ NotificationsTab: () => <div>NOTIFICATIONS_TAB_CONTENT</div> }))
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
    manageableScopes: [],
    isLoading: false,
  }
}

const renderDialog = (
  activeTab: SettingsTab = "account",
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

  it("renders the account page by default", () => {
    renderDialog("account")
    expect(screen.getByText("PROFILE_TAB_CONTENT")).toBeInTheDocument()
    expect(screen.getByText("SECURITY_TAB_CONTENT")).toBeInTheDocument()
  })

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn()
    renderDialog("account", vi.fn(), onClose)

    fireEvent.click(screen.getByLabelText(/close|chiudi/i))

    expect(onClose).toHaveBeenCalled()
  })

  it("zero-trust: only personal families render, and a workspace tab falls back to My account", () => {
    renderDialog("people")
    expect(screen.getByText("PROFILE_TAB_CONTENT")).toBeInTheDocument()
    expect(screen.queryByText("USERS_TAB_CONTENT")).not.toBeInTheDocument()
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument()
  })

  it("the open tab unfolds its bookmarks and picking one reports tab and section", () => {
    const onTabChange = vi.fn()
    renderDialog("account", onTabChange)

    fireEvent.click(screen.getByRole("button", { name: "Password" }))

    expect(onTabChange).toHaveBeenCalledWith("account", "password")
  })

  it("a tab that was never opened keeps its bookmarks folded", () => {
    renderDialog("notifications")
    expect(screen.queryByRole("button", { name: "Password" })).not.toBeInTheDocument()
  })

  it("bookmarks stay unfolded when another tab is opened", () => {
    const { rerender } = renderDialog("account")
    expect(screen.getByRole("button", { name: "Password" })).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <SettingsDialog open onClose={vi.fn()} activeTab="notifications" onTabChange={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole("button", { name: "Password" })).toBeInTheDocument()
  })

  it("clicking the shown parent folds its bookmarks, clicking it again unfolds them", () => {
    const onTabChange = vi.fn()
    renderDialog("account", onTabChange)
    const parent = screen.getAllByRole("button").filter((btn) => btn.textContent === "My account")[0]

    fireEvent.click(parent)
    expect(screen.queryByRole("button", { name: "Password" })).not.toBeInTheDocument()
    expect(onTabChange).not.toHaveBeenCalled()

    fireEvent.click(parent)
    expect(screen.getByRole("button", { name: "Password" })).toBeInTheDocument()
  })

  it("a global manage_users holder gets the Workspace family with Users & roles stacked in one page", () => {
    setPermissions({ canGlobally: (p: string) => p === "manage_users", canAnywhere: (p: string) => p === "manage_users" })
    renderDialog("people")

    expect(screen.getByText("Workspace")).toBeInTheDocument()
    expect(screen.getByText("USERS_TAB_CONTENT")).toBeInTheDocument()
    expect(screen.getByText("INVITATIONS_TAB_CONTENT")).toBeInTheDocument()
    expect(screen.getByText("ROLES_TAB_CONTENT")).toBeInTheDocument()
  })

  it("switches tabs when clicking sidebar navigation items", () => {
    setPermissions({ canGlobally: (p: string) => p === "manage_users" })
    const onTabChange = vi.fn()
    renderDialog("account", onTabChange)

    fireEvent.click(screen.getAllByRole("button").filter((btn) => btn.textContent === "Site")[0])

    expect(onTabChange).toHaveBeenCalledWith("site")
  })

  it("ends the list with Log out", () => {
    renderDialog("account")
    expect(screen.getByRole("button", { name: /log out|esci/i })).toBeInTheDocument()
  })

  it("never lists Content Types: the builder is its own page", () => {
    setPermissions({ canGlobally: () => true, canAnywhere: () => true })
    renderDialog("account")
    expect(screen.queryByText(/Content Types/)).not.toBeInTheDocument()
  })
})
