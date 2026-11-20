// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import type { TFunction } from "i18next"
import { Layers, PinOff, Plus, Settings } from "@/components/icons"
import { collectPaletteItems } from "../../lib/collect-palette-items"
import { createPinsProvider, pinSourceId, toPinRowId } from "../../providers/pins-provider"
import type { PalettePinsState } from "../../use-palette-pins"
import type {
  CommandPage,
  PaletteItem,
  PalettePermissions,
  PalettePrefix,
  PaletteProvider,
} from "../../types"

const t = ((key: string, options?: { id?: string }) => (options?.id ? `${key}:${options.id}` : key)) as unknown as TFunction

const NO_PERMISSIONS: PalettePermissions = {
  can: () => false,
  canAnywhere: () => false,
  canGlobally: () => false,
}

function row(id: string, overrides: Partial<PaletteItem> = {}): PaletteItem {
  return { id, section: "Source section", label: id, icon: Settings, perform: { kind: "navigate", to: "/" }, ...overrides }
}

function source(...rows: PaletteItem[]): PaletteProvider {
  return { id: "source", pages: ["root"], getItems: () => [], getStableItems: () => rows }
}

function ready(...ids: string[]): PalettePinsState {
  return { status: "ready", ids, saving: false }
}

function idleRows(
  provider: PaletteProvider,
  overrides: { page?: CommandPage; query?: string; prefix?: PalettePrefix } = {},
): readonly PaletteItem[] {
  return provider.getItems({ page: "root", query: "", permissions: NO_PERMISSIONS, ...overrides })
}

describe("createPinsProvider", () => {
  it("on the idle root lists the stored ids in stored order under the Pinned section, each with its source label, icon and perform", () => {
    const users = row("nav:/users", { label: "Users", icon: Layers, perform: { kind: "navigate", to: "/users" } })
    const theme = row("tools:theme", { label: "Theme", icon: Plus, perform: { kind: "copy", value: "dark" } })
    const provider = createPinsProvider({
      t,
      pins: ready("tools:theme", "nav:/users"),
      sources: [source(users, theme)],
      catalogueReady: true,
      unpin: vi.fn(),
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.label)).toEqual(["Theme", "Users"])
    expect(rows.map((item) => item.section)).toEqual(["commandPalette.pins.section", "commandPalette.pins.section"])
    expect(rows.map((item) => item.icon)).toEqual([Plus, Layers])
    expect(rows.map((item) => item.perform)).toEqual([theme.perform, users.perform])
  })

  it("gives each row the pin: id and the source description, else its section, as the second line", () => {
    const described = row("content:open:posts", { description: "posts", section: "Contents" })
    const plain = row("nav:/users", { section: "Navigate" })
    const provider = createPinsProvider({
      t,
      pins: ready("content:open:posts", "nav:/users"),
      sources: [source(described, plain)],
      catalogueReady: true,
      unpin: vi.fn(),
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.id)).toEqual(["pin:content:open:posts", "pin:nav:/users"])
    expect(rows.map((item) => item.description)).toEqual(["posts", "Navigate"])
  })

  it.each([
    ["while typing", { query: "us" }],
    ["with a prefix", { prefix: ">" as const }],
    ["on a sub-page", { page: "seeds" as const }],
  ])("emits nothing %s", (_name, overrides) => {
    const provider = createPinsProvider({
      t,
      pins: ready("nav:/"),
      sources: [source(row("nav:/"))],
      catalogueReady: true,
      unpin: vi.fn(),
    })

    const rows = idleRows(provider, overrides)

    expect(rows).toEqual([])
  })

  it("emits nothing when the pins are unavailable", () => {
    const provider = createPinsProvider({
      t,
      pins: { status: "unavailable" },
      sources: [source(row("nav:/"))],
      catalogueReady: true,
      unpin: vi.fn(),
    })

    const rows = idleRows(provider)

    expect(rows).toEqual([])
  })

  it("a source requiring a permission the caller lacks is listed disabled with that permission", () => {
    // Regression guard: a pin must never run what its source cannot.
    const createPosts = row("content:create:posts", { requires: { permission: "content:create", scope: "posts" } })
    const provider = createPinsProvider({
      t,
      pins: ready("content:create:posts"),
      sources: [source(createPosts)],
      catalogueReady: true,
      unpin: vi.fn(),
    })

    const [pinnedRow] = collectPaletteItems(
      [provider],
      { page: "root", query: "", permissions: NO_PERMISSIONS },
      ({ permission }) => `missing ${permission}`,
    )

    expect(pinnedRow.id).toBe("pin:content:create:posts")
    expect(pinnedRow.disabledReason).toBe("missing content:create")
  })

  it("an unresolved id is omitted while the catalogue is not ready", () => {
    const provider = createPinsProvider({
      t,
      pins: ready("content:open:posts", "nav:/"),
      sources: [source(row("nav:/"))],
      catalogueReady: false,
      unpin: vi.fn(),
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.id)).toEqual(["pin:nav:/"])
  })

  it("an unresolved id is listed as an enabled unavailable row once the catalogue is ready, and running it unpins that id", () => {
    const unpin = vi.fn()
    const provider = createPinsProvider({
      t,
      pins: ready("content:open:deleted"),
      sources: [source(row("nav:/"))],
      catalogueReady: true,
      unpin,
    })

    const [unavailable] = collectPaletteItems(
      [provider],
      { page: "root", query: "", permissions: NO_PERMISSIONS },
      String,
    )
    if (unavailable.perform.kind === "run") unavailable.perform.run()

    expect(unavailable).toMatchObject({
      id: "pin:content:open:deleted",
      label: "commandPalette.pins.unavailable.label",
      description: "commandPalette.pins.unavailable.hint:content:open:deleted",
      icon: PinOff,
      disabledReason: null,
    })
    expect(unpin).toHaveBeenCalledExactlyOnceWith("content:open:deleted", "content:open:deleted")
  })
})

describe("pinSourceId", () => {
  it("round-trips toPinRowId and returns null for any other id, pin: alone included", () => {
    const roundTrip = pinSourceId(toPinRowId("content:open:posts"))

    expect(roundTrip).toBe("content:open:posts")
    expect(pinSourceId("content:open:posts")).toBeNull()
    expect(pinSourceId("pin:")).toBeNull()
  })
})
