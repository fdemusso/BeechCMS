// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { GeneralSettings } from "../types/settings.types"
import { SETTINGS_ENTRIES } from "../lib/settings-registry"

const settings: GeneralSettings = {
  siteTitle: "Acme",
  siteLogo: "/beechLogoDark.svg",
  defaultLanguage: "en",
  locales: ["en", "it"],
  defaultLocale: "en",
  timezone: "Europe/Rome",
  currency: "EUR",
  company: { name: "Acme", website: "https://acme.com", abbreviation: "ACM" },
  dateFormat: "dd/MM/yyyy",
  trashRetentionDays: 21,
  features: { drafts: true, media: true, search: true, activityLog: true, email: false },
}

vi.mock("../hooks/use-settings", () => ({
  useGeneralSettings: () => ({ data: settings, isLoading: false }),
  useUpdateGeneralSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { SiteTab } from "./site-tab"

/**
 * The shape of Site, written down as tests: the sections are the sidebar's bookmarks in the same order, the first
 * three share one form, the languages have their own, and every field is named, typed and described for the browser
 * and for assistive technology.
 */
describe("Site markup", () => {
  beforeEach(() => {
    render(<SiteTab />)
  })

  it("is the sections of the sidebar bookmarks, in the same order, each opened by one heading", () => {
    const bookmarks = SETTINGS_ENTRIES.find((entry) => entry.id === "site")!.sections.map((section) => section.id)
    const sectionIds = Array.from(document.querySelectorAll("section")).map((section) => section.id.replace("settings-section-", ""))
    expect(sectionIds).toEqual(bookmarks)

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent)
    expect(headings).toEqual(["Company Info", "Site Defaults", "Trash", "Content languages"])
  })

  it("never repeats an id", () => {
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("saves the first three sections together and the languages on their own, with no form inside a form", () => {
    const forms = Array.from(document.querySelectorAll("form"))
    expect(forms).toHaveLength(2)
    expect(forms.some((form) => form.querySelector("form"))).toBe(false)

    const siteForm = screen.getByLabelText("Company Website").closest("form")!
    expect(within(siteForm).getByLabelText("Retention (days)")).toBeInTheDocument()
    expect(within(siteForm).queryByRole("heading", { name: "Content languages" })).not.toBeInTheDocument()
    expect(within(siteForm).getByRole("button", { name: "Save changes" })).toHaveAttribute("type", "submit")
  })

  it("gives every field a visible, associated label", () => {
    for (const label of ["Site Title / Company Name", "Company Abbreviation", "Company Website", "Default Language", "Default Timezone", "Default Currency", "Retention (days)", "Add a language"]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument()
    }
  })

  it("tells the browser what the company fields are", () => {
    expect(screen.getByLabelText("Site Title / Company Name")).toHaveAttribute("autocomplete", "organization")
    expect(screen.getByLabelText("Company Website")).toHaveAttribute("autocomplete", "url")
    expect(screen.getByLabelText("Company Website")).toHaveAttribute("type", "url")
    expect(screen.getByLabelText("Company Abbreviation")).toHaveAttribute("autocomplete", "off")
  })

  it("keeps autofill out of the numbers and the language codes", () => {
    expect(screen.getByLabelText("Retention (days)")).toHaveAttribute("autocomplete", "off")
    expect(screen.getByLabelText("Retention (days)")).toHaveAttribute("inputmode", "numeric")
    const add = screen.getByLabelText("Add a language")
    expect(add).toHaveAttribute("autocomplete", "off")
    expect(add).toHaveAttribute("spellcheck", "false")
  })

  it("points the retention field at its hint", () => {
    const field = screen.getByLabelText("Retention (days)")
    expect(document.getElementById(field.getAttribute("aria-describedby")!)).toHaveTextContent("0 = never erase automatically.")
  })

  it("words a refused retention next to the field, flags it invalid and moves the focus there", () => {
    const field = screen.getByLabelText("Retention (days)")
    fireEvent.change(field, { target: { value: "abc" } })

    fireEvent.submit(field.closest("form")!)

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Retention must be a whole number between 0 and")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field.getAttribute("aria-describedby")).toContain(alert.id)
    expect(field).toHaveFocus()

    fireEvent.change(field, { target: { value: "30" } })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(field).not.toHaveAttribute("aria-invalid")
  })

  it("sends the focus to the first refused field when two are refused", () => {
    fireEvent.change(screen.getByLabelText("Company Website"), { target: { value: "not a url" } })
    fireEvent.change(screen.getByLabelText("Retention (days)"), { target: { value: "abc" } })

    fireEvent.submit(screen.getByLabelText("Company Website").closest("form")!)

    expect(screen.getAllByRole("alert")).toHaveLength(2)
    expect(screen.getByLabelText("Company Website")).toHaveFocus()
  })
})

describe("Content languages markup", () => {
  beforeEach(() => {
    render(<SiteTab />)
  })

  it("is a list with one language per row, named and counted", () => {
    const list = screen.getByRole("list", { name: "Content languages in use" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getAllByRole("status").some((status) => status.textContent === "2 languages")).toBe(true)
    expect(list).toHaveAccessibleDescription(/Removing a language never deletes its translations/)
  })

  it("shows five languages, then scrolls them in a shadcn ScrollArea", () => {
    const list = screen.getByRole("list", { name: "Content languages in use" })
    const scroller = list.closest('[data-slot="scroll-area"]') as HTMLElement
    expect(scroller).not.toBeNull()
    expect(scroller.style.maxHeight).toBe("17.5rem") // 5 rows of 3.5rem
    expect(within(scroller).getByRole("group", { name: "Content languages in use" })).toHaveAttribute("tabindex", "0")
    for (const row of within(list).getAllByRole("listitem")) expect(row).toHaveClass("h-14")
  })

  it("names every button after the language it acts on, and leaves the default in place", () => {
    expect(screen.getByRole("button", { name: "Make Italian the default language" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove Italian from the content languages" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Remove English from the content languages" })).toBeDisabled()
    expect(screen.getByText("Default")).toBeInTheDocument()
  })

  it("adds a language with a form, not a key handler, and words a refusal next to the field", () => {
    const field = screen.getByLabelText("Add a language")
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("type", "submit")

    fireEvent.change(field, { target: { value: "!" } })
    fireEvent.submit(field.closest("form")!)

    const alert = screen.getByRole("alert")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAttribute("aria-describedby", alert.id)
  })
})
