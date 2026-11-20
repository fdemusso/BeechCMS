// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18n from "@/lib/i18n"
import { SETTINGS_ENTRIES } from "../lib/settings-registry"

const setTheme = vi.fn()
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "dark", setTheme }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AppearanceTab } from "./appearance-tab"
import { LanguageTab } from "./language-tab"

afterEach(() => vi.clearAllMocks())

describe("Appearance markup", () => {
  it("is the sections of the sidebar bookmarks, in the same order, each opened by one heading", () => {
    render(<AppearanceTab />)
    const bookmarks = SETTINGS_ENTRIES.find((entry) => entry.id === "appearance")!.sections.map((section) => section.id)
    expect(Array.from(document.querySelectorAll("section")).map((s) => s.id.replace("settings-section-", ""))).toEqual(bookmarks)
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Theme", "Contents per page"])
  })

  it("never repeats an id", () => {
    render(<AppearanceTab />)
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("is a named radio group of three cards that are one choice, with the current one checked", () => {
    render(<AppearanceTab />)
    const group = screen.getByRole("radiogroup", { name: "Colour scheme" })
    const radios = screen.getAllByRole("radio")
    expect(radios.map((radio) => radio.textContent)).toEqual(["Light", "Dark", "System"])
    expect(radios).toHaveLength(3)
    for (const radio of radios) expect(group).toContainElement(radio)
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked()
  })

  it("applies the scheme the moment a card is chosen", () => {
    render(<AppearanceTab />)
    fireEvent.click(screen.getByRole("radio", { name: "Light" }))
    expect(setTheme).toHaveBeenCalledWith("light")
  })

  it("labels the rows-per-page picker", () => {
    render(<AppearanceTab />)
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeInTheDocument()
  })
})

describe("Language markup", () => {
  it("is one section named for what it changes, with a labelled select inside", () => {
    render(<LanguageTab />)
    expect(screen.getByRole("region", { name: "Language" }).id).toBe("settings-section-language")
    expect(screen.getByRole("combobox", { name: "Interface language" })).toBeInTheDocument()
  })

  it("shows the current language in itself, with its code", () => {
    render(<LanguageTab />)
    expect(screen.getByRole("combobox", { name: "Interface language" })).toHaveTextContent("English (en)")
  })

  it("offers every dashboard language named in itself and marked with its own lang", async () => {
    render(<LanguageTab />)
    await userEvent.click(screen.getByRole("combobox", { name: "Interface language" }))
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => [option.textContent, option.getAttribute("lang")])).toEqual([
      ["English (en)", "en"],
      ["Italiano (it)", "it"],
      ["Español (es)", "es"],
      ["Deutsch (de)", "de"],
      ["Français (fr)", "fr"],
    ])
  })

  it("switches the dashboard language the moment one is chosen", async () => {
    const change = vi.spyOn(i18n, "changeLanguage").mockResolvedValue((() => "") as never)
    render(<LanguageTab />)
    await userEvent.click(screen.getByRole("combobox", { name: "Interface language" }))
    await userEvent.click(await screen.findByRole("option", { name: "Español (es)" }))
    expect(change).toHaveBeenCalledWith("es")
    change.mockRestore()
  })
})
