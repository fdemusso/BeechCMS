// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SettingsDialog } from "./settings-dialog"
import type { SettingsTab } from "../types/settings.types"

// Mock sub-tab components to keep rendering lightweight in UI unit test
vi.mock("./profile-tab", () => ({ ProfileTab: () => <div>PROFILE_TAB_CONTENT</div> }))
vi.mock("./site-tab", () => ({ SiteTab: () => <div>SITE_TAB_CONTENT</div> }))
vi.mock("./appearance-tab", () => ({ AppearanceTab: () => <div>APPEARANCE_TAB_CONTENT</div> }))
vi.mock("./language-tab", () => ({ LanguageTab: () => <div>LANGUAGE_TAB_CONTENT</div> }))
vi.mock("./security-tab", () => ({ SecurityTab: () => <div>SECURITY_TAB_CONTENT</div> }))
vi.mock("./storage-tab", () => ({ StorageTab: () => <div>STORAGE_TAB_CONTENT</div> }))
vi.mock("@/lib/api", () => ({ logout: vi.fn() }))
vi.mock("./notifications-tab", () => ({ NotificationsTab: () => <div>NOTIFICATIONS_TAB_CONTENT</div> }))
vi.mock("@/features/oauth-consent", () => ({ ConnectedAppsTab: () => <div>CONNECTED_APPS_CONTENT</div> }))
vi.mock("@/features/rbac", () => ({
  UsersSection: () => <div>USERS_TAB_CONTENT</div>,
  RolesSection: () => <div>ROLES_TAB_CONTENT</div>,
  InvitationsSection: () => <div>INVITATIONS_TAB_CONTENT</div>,
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

  /** A folded submenu stays mounted for its animation; `inert` is what takes it out of reach. */
  const isFolded = (name: string) => screen.getByRole("button", { name, hidden: true }).closest("[inert]") !== null

  it("a tab that was never opened keeps its bookmarks folded", () => {
    renderDialog("notifications")
    expect(isFolded("Password")).toBe(true)
  })

  it("bookmarks stay unfolded when another tab is opened", () => {
    const { rerender } = renderDialog("account")
    expect(isFolded("Password")).toBe(false)

    rerender(
      <MemoryRouter>
        <SettingsDialog open onClose={vi.fn()} activeTab="notifications" onTabChange={vi.fn()} />
      </MemoryRouter>
    )

    expect(isFolded("Password")).toBe(false)
  })

  it("clicking the shown parent folds its bookmarks, clicking it again unfolds them", () => {
    const onTabChange = vi.fn()
    renderDialog("account", onTabChange)
    const parent = screen.getAllByRole("button").filter((btn) => btn.textContent === "My account")[0]

    fireEvent.click(parent)
    expect(isFolded("Password")).toBe(true)
    expect(parent).toHaveAttribute("aria-expanded", "false")
    expect(onTabChange).not.toHaveBeenCalled()

    fireEvent.click(parent)
    expect(isFolded("Password")).toBe(false)
    expect(parent).toHaveAttribute("aria-expanded", "true")
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

  it("the search narrows the list to matching tabs and bookmarks, and says so when nothing matches", () => {
    setPermissions({ canGlobally: (p: string) => p === "manage_users", canAnywhere: (p: string) => p === "manage_users" })
    renderDialog("account")
    const search = screen.getByRole("searchbox")

    fireEvent.change(search, { target: { value: "invitations" } })
    expect(screen.getAllByRole("button", { name: "Invitations" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "zzzz" } })
    expect(screen.getByText("No settings found")).toBeInTheDocument()
  })

  it("picking a search hit reports the tab and the bookmark", () => {
    setPermissions({ canGlobally: () => false, canAnywhere: (p: string) => p === "manage_users" })
    const onTabChange = vi.fn()
    renderDialog("account", onTabChange)

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "invitations" } })
    fireEvent.click(screen.getByRole("button", { name: "Invitations" }))

    expect(onTabChange).toHaveBeenCalledWith("people", "invitations")
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

  describe("markup", () => {
    it("uses no landmark the app behind it already has: no <main>, no <header>", () => {
      renderDialog("account")
      expect(document.querySelector("main, header")).toBeNull()
    })

    it("is a named navigation of named lists, and a named page beside it", () => {
      renderDialog("account")
      const nav = screen.getByRole("navigation", { name: "Settings categories" })
      expect(within(nav).getByRole("list", { name: "Account" })).toBeInTheDocument()
      expect(within(nav).getByRole("list", { name: "Experience" })).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "My account" })).toBeInTheDocument()
    })

    it("has one page heading, and the groups of the sidebar are labels, not headings", () => {
      renderDialog("account")
      const nav = screen.getByRole("navigation", { name: "Settings categories" })
      expect(within(nav).queryAllByRole("heading")).toHaveLength(0)
      expect(screen.getByRole("heading", { name: "My account", level: 2 })).toHaveAttribute("id", "settings-page-title")
    })

    it("searches with a real search field inside a <search> landmark", () => {
      renderDialog("account")
      const field = screen.getByRole("searchbox")
      expect(field).toHaveAttribute("type", "search")
      expect(field).toHaveAttribute("autocomplete", "off")
      // The <search> element is the landmark (browsers give it the role "search"); the test library does not map it, so ask for it by tag.
      const landmark = document.querySelector("search")
      expect(landmark).not.toBeNull()
      expect(landmark).toContainElement(field)
    })

    it("says how many tabs a search found, and names the page it changes to", () => {
      renderDialog("account")
      expect(screen.getAllByRole("status").some((status) => status.textContent === "My account")).toBe(true)

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "password" } })
      expect(screen.getAllByRole("status").some((status) => status.textContent === "1 setting found")).toBe(true)
    })

    it("ties each expandable entry to the submenu it opens", () => {
      renderDialog("account")
      const parent = screen.getAllByRole("button").filter((btn) => btn.textContent === "My account")[0]
      const submenu = document.getElementById(parent.getAttribute("aria-controls")!)
      expect(submenu).toContainElement(screen.getByRole("button", { name: "Password" }))
      expect(parent).toHaveAttribute("aria-current", "page")
    })

    it("starts the keyboard on the entry of the page that is open", async () => {
      renderDialog("account")
      const current = screen.getAllByRole("button").find((btn) => btn.getAttribute("aria-current") === "page")!
      await waitFor(() => expect(current).toHaveFocus())
    })
  })

  describe("opening and closing", () => {
    it("fades the dialog and its backdrop in over 220ms and out 20% quicker, with no zoom", () => {
      renderDialog("account")
      const content = document.querySelector('[data-slot="dialog-content"]')!
      const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
      for (const element of [content, overlay]) {
        expect(element).toHaveClass("data-open:duration-[220ms]", "data-closed:duration-[176ms]")
      }
      expect(content).toHaveClass("data-open:zoom-in-100", "data-closed:zoom-out-100")
    })
  })
})
