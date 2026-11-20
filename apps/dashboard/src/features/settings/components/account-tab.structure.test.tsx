// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

const profile = {
  name: "Ada", surname: "Lovelace", email: "ada@example.com", avatarUrl: "https://cdn.example.com/ada.png", hasCustomAvatar: true,
}
const sessions = [
  { id: "s1", created_at: 1_700_000_000, expires_at: 1_800_000_000 },
  { id: "s2", created_at: 1_700_100_000, expires_at: 1_800_100_000 },
]
const activity = [
  { id: "a1", action: "login", entity_type: "auth", entity_slug: null, details: JSON.stringify({ ip: "203.0.113.7" }), created_at: 1_700_000_000 },
  { id: "a2", action: "update", entity_type: "content", entity_slug: "posts", details: JSON.stringify({ title: "Hello" }), created_at: 1_700_000_500 },
]

vi.mock("../hooks/use-settings", () => ({
  useProfile: () => ({ data: profile, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSessions: () => ({ data: sessions, isLoading: false }),
  useRevokeSession: () => ({ mutateAsync: vi.fn() }),
  useSettingsActivity: () => ({ data: activity, isLoading: false }),
}))

import { AccountTab } from "./account-tab"

/**
 * The shape of My account, written down as tests so it cannot drift: one heading per section, forms whose fields
 * tell the browser what they are, lists that are lists, and every control with a name a screen reader can say.
 */
describe("My account markup", () => {
  beforeEach(() => {
    render(<AccountTab />)
  })

  it("is four named sections, each opened by one heading, in the order of the sidebar bookmarks", () => {
    const headings = screen.getAllByRole("heading").map((h) => h.textContent)
    expect(headings).toEqual(["Profile information", "Change password", "Active sessions", "Recent activity"])
    for (const name of headings) {
      const region = screen.getByRole("region", { name: name! })
      expect(region.tagName).toBe("SECTION")
      expect(region.id).toMatch(/^settings-section-/)
    }
  })

  it("never repeats an id", () => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every form control a visible, associated label", () => {
    for (const label of ["Name", "Last name", "Email", "Current password", "New password", "Confirm password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it("lets autofill know which field is which", () => {
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "given-name")
    expect(screen.getByLabelText("Last name")).toHaveAttribute("autocomplete", "family-name")
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText("Email")).toBeRequired()
    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password")
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password")
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password")
  })

  it("tells a password manager whose password this is, without showing the address twice", () => {
    const form = screen.getByLabelText("Current password").closest("form")!
    const username = form.querySelector<HTMLInputElement>('input[autocomplete="username"]')!
    expect(username).toHaveValue("ada@example.com")
    expect(username).toHaveAttribute("hidden")
    expect(username).toHaveAttribute("readonly")
  })

  it("keeps the profile form free of password fields, so a manager leaves it alone", () => {
    const form = screen.getByLabelText("Name").closest("form")!
    expect(form.querySelector('input[type="password"]')).toBeNull()
  })

  it("points each form at the description of its section", () => {
    for (const label of ["Name", "Current password"]) {
      const form = screen.getByLabelText(label).closest("form")!
      const description = document.getElementById(form.getAttribute("aria-describedby")!)
      expect(description?.tagName).toBe("P")
    }
  })

  it("makes the photo circle a button and its picture decorative", () => {
    const group = screen.getByRole("group", { name: "Photo" })
    expect(within(group).getByRole("button", { name: "Change photo" })).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "Remove photo" })).toBeInTheDocument()
    for (const img of group.querySelectorAll("img")) expect(img).toHaveAttribute("alt", "")
  })

  it("names each password eye after what it shows and which field it controls", () => {
    const eyes = screen.getAllByRole("button", { name: "Show password" })
    expect(eyes).toHaveLength(3)
    expect(eyes.map((eye) => eye.getAttribute("aria-controls"))).toEqual(["current-password", "new-password", "confirm-password"])
  })

  it("lists sessions and activity as lists of rows, with real dates", () => {
    const lists = screen.getAllByRole("list")
    expect(lists).toHaveLength(2)
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(sessions.length)
    expect(within(lists[1]).getAllByRole("listitem")).toHaveLength(activity.length)
    expect(lists[1].querySelectorAll("time[datetime]")).toHaveLength(activity.length)
  })

  it("makes each scrolling list a named stop in the tab order, since nothing inside it may be focusable", () => {
    for (const name of ["Active sessions", "Recent activity"]) {
      const scroller = screen.getByRole("group", { name })
      expect(scroller, name).toHaveAttribute("tabindex", "0")
    }
  })

  it("names each revoke button after the session it ends", () => {
    const revoke = screen.getAllByRole("button", { name: /Revoke the session created on/ })
    expect(revoke).toHaveLength(sessions.length)
    expect(new Set(revoke.map((b) => b.getAttribute("aria-label"))).size).toBe(sessions.length)
  })

  it("answers mismatched passwords next to the field, flags it invalid and moves the focus there", () => {
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } })
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password-1" } })
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "something-else" } })

    fireEvent.submit(screen.getByLabelText("Current password").closest("form")!)

    const confirm = screen.getByLabelText("Confirm password")
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("New passwords do not match")
    expect(confirm).toHaveAttribute("aria-invalid", "true")
    expect(confirm).toHaveAttribute("aria-describedby", alert.id)
    expect(confirm).toHaveFocus()

    fireEvent.change(confirm, { target: { value: "a-new-password-1" } })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(confirm).not.toHaveAttribute("aria-invalid")
  })

  it("points the new password at its strength verdict only once there is something to judge", () => {
    const field = screen.getByLabelText("New password")
    expect(field).not.toHaveAttribute("aria-describedby")

    fireEvent.change(field, { target: { value: "Tr0ub4dor&3-horse" } })

    expect(document.getElementById(field.getAttribute("aria-describedby")!)).toHaveAttribute("data-testid", "password-strength-indicator")
  })
})
