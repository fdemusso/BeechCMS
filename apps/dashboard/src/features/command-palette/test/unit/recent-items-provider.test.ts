// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { Layers, Plus, Settings } from "@/components/icons"
import { collectPaletteItems } from "../../lib/collect-palette-items"
import { collectStableItems } from "../../lib/stable-items"
import {
  createRecentItemsProvider,
  recentIdToRecord,
  recentSourceId,
  toRecentRowId,
} from "../../providers/recent-items-provider"
import type {
  CommandPage,
  PaletteItem,
  PalettePerform,
  PalettePermissions,
  PalettePrefix,
  PaletteProvider,
} from "../../types"

const t = ((key: string) => key) as unknown as TFunction

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

function idleRows(
  provider: PaletteProvider,
  overrides: { page?: CommandPage; query?: string; prefix?: PalettePrefix } = {},
): readonly PaletteItem[] {
  return provider.getItems({ page: "root", query: "", permissions: NO_PERMISSIONS, ...overrides })
}

describe("createRecentItemsProvider", () => {
  it("on the idle root lists the stored ids in order under the Recent section, each with its source label, icon and perform", () => {
    const users = row("nav:/users", { label: "Users", icon: Layers, perform: { kind: "navigate", to: "/users" } })
    const theme = row("tools:theme", { label: "Theme", icon: Plus, perform: { kind: "copy", value: "dark" } })
    const provider = createRecentItemsProvider({
      t,
      recent: { status: "ready", ids: ["tools:theme", "nav:/users"] },
      sources: [source(users, theme)],
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.label)).toEqual(["Theme", "Users"])
    expect(rows.map((item) => item.section)).toEqual(["commandPalette.recentSection", "commandPalette.recentSection"])
    expect(rows.map((item) => item.icon)).toEqual([Plus, Layers])
    expect(rows.map((item) => item.perform)).toEqual([theme.perform, users.perform])
  })

  it("gives each row the recent: id, so it never collides with its source on the same list", () => {
    const home = row("nav:/")
    const sources = source(home)
    const provider = createRecentItemsProvider({ t, recent: { status: "ready", ids: ["nav:/"] }, sources: [sources] })
    const navigation: PaletteProvider = { id: "nav", pages: ["root"], getItems: () => [home] }

    const rows = collectPaletteItems([provider, navigation], { page: "root", query: "", permissions: NO_PERMISSIONS }, String)

    expect(rows.map((item) => item.id)).toEqual(["recent:nav:/", "nav:/"])
  })

  it("uses the source description, else the source section, as the second line", () => {
    const described = row("content:open:posts", { description: "posts", section: "Contents" })
    const plain = row("nav:/users", { section: "Navigate" })
    const provider = createRecentItemsProvider({
      t,
      recent: { status: "ready", ids: ["content:open:posts", "nav:/users"] },
      sources: [source(described, plain)],
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.description)).toEqual(["posts", "Navigate"])
  })

  it.each([
    ["while typing", { query: "us" }],
    ["with a prefix", { prefix: ">" as const }],
    ["on a sub-page", { page: "seeds" as const }],
  ])("emits nothing %s", (_name, overrides) => {
    const provider = createRecentItemsProvider({
      t,
      recent: { status: "ready", ids: ["nav:/"] },
      sources: [source(row("nav:/"))],
    })

    const rows = idleRows(provider, overrides)

    expect(rows).toEqual([])
  })

  it("emits nothing when storage is unavailable", () => {
    const provider = createRecentItemsProvider({ t, recent: { status: "unavailable" }, sources: [source(row("nav:/"))] })

    const rows = idleRows(provider)

    expect(rows).toEqual([])
  })

  it("skips a stored id no source lists any more", () => {
    const provider = createRecentItemsProvider({
      t,
      recent: { status: "ready", ids: ["content:open:deleted", "nav:/"] },
      sources: [source(row("nav:/"))],
    })

    const rows = idleRows(provider)

    expect(rows.map((item) => item.id)).toEqual(["recent:nav:/"])
  })

  it("a source requiring a permission the caller lacks is listed disabled with that permission", () => {
    // Regression guard: a recent row must never run what its source cannot.
    const createPosts = row("content:create:posts", { requires: { permission: "content:create", scope: "posts" } })
    const provider = createRecentItemsProvider({
      t,
      recent: { status: "ready", ids: ["content:create:posts"] },
      sources: [source(createPosts)],
    })

    const [recentRow] = collectPaletteItems(
      [provider],
      { page: "root", query: "", permissions: NO_PERMISSIONS },
      ({ permission }) => `missing ${permission}`,
    )

    expect(recentRow.id).toBe("recent:content:create:posts")
    expect(recentRow.disabledReason).toBe("missing content:create")
  })
})

describe("recentIdToRecord", () => {
  const PERFORMS: PalettePerform[] = [
    { kind: "navigate", to: "/users" },
    { kind: "run", run: () => {} },
    { kind: "copy", value: "summary" },
  ]

  it.each(PERFORMS)("returns the id of a stable row that performs $kind", (perform) => {
    const item = row("source:row", { perform })
    const stable = collectStableItems([source(item)], { permissions: NO_PERMISSIONS })

    const recorded = recentIdToRecord(item, stable)

    expect(recorded).toBe("source:row")
  })

  it("unwraps a recent row to its source id", () => {
    const item = row("nav:/users")
    const stable = collectStableItems([source(item)], { permissions: NO_PERMISSIONS })

    const recorded = recentIdToRecord({ ...item, id: toRecentRowId("nav:/users") }, stable)

    expect(recorded).toBe("nav:/users")
  })

  it("returns null for a row that opens a sub-page", () => {
    const item = row("nav:settings", { perform: { kind: "page", page: "settings" } })
    const stable = collectStableItems([source(item)], { permissions: NO_PERMISSIONS })

    const recorded = recentIdToRecord(item, stable)

    expect(recorded).toBeNull()
  })

  it("returns null for a row whose id is not in the stable lookup", () => {
    const stable = collectStableItems([source(row("nav:/"))], { permissions: NO_PERMISSIONS })

    const recorded = recentIdToRecord(row("search:posts:1"), stable)

    expect(recorded).toBeNull()
  })
})

describe("recentSourceId", () => {
  it("round-trips toRecentRowId and returns null for any other id, recent: alone included", () => {
    const roundTrip = recentSourceId(toRecentRowId("content:open:posts"))

    expect(roundTrip).toBe("content:open:posts")
    expect(recentSourceId("content:open:posts")).toBeNull()
    expect(recentSourceId("recent:")).toBeNull()
  })
})
