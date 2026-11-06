// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { Seed } from "@beechcms/core"
import { DEFAULT_SIDEBAR_ORDER, existingGroups, sidebarGroupPreview } from "../../lib/sidebar-preview"

function seed(slug: string, dashboard?: Seed["dashboard"]): Seed {
  return { slug, label: slug, branches: [], dashboard } as unknown as Seed
}

describe("existingGroups", () => {
  it("lists each named group once, in the order the sidebar meets them", () => {
    const seeds = [
      seed("a", { group: "Sales" }),
      seed("b"),
      seed("c", { group: "Marketing" }),
      seed("d", { group: "Sales" }),
    ]

    expect(existingGroups(seeds)).toEqual(["Sales", "Marketing"])
  })
})

describe("sidebarGroupPreview", () => {
  const current = { slug: null, title: "Leads", order: 5 }

  it("lists the group's neighbours and the new seed sorted by order", () => {
    const others = [
      seed("deals", { group: "Sales", order: 10 }),
      seed("contacts", { group: "Sales", order: 1 }),
    ]

    const { items } = sidebarGroupPreview(others, current, "Sales")

    expect(items.map((i) => i.title)).toEqual(["contacts", "Leads", "deals"])
    expect(items.find((i) => i.current)?.order).toBe(5)
  })

  it("leaves out other groups, hidden seeds and the seed being edited", () => {
    const others = [
      seed("posts", { group: "Blog" }),
      seed("secret", { group: "Sales", hidden: true }),
      seed("leads", { group: "Sales", order: 2 }),
    ]

    const { items } = sidebarGroupPreview(others, { slug: "leads", title: "Leads", order: 7 }, "Sales")

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ current: true, order: 7 })
  })

  it("puts a seed without an order last, like the sidebar does", () => {
    const others = [seed("a", { order: 50 })]

    const { items } = sidebarGroupPreview(others, { slug: null, title: "New" }, "")

    expect(items.map((i) => i.title)).toEqual(["a", "New"])
    expect(items[1].order).toBe(DEFAULT_SIDEBAR_ORDER)
  })

  it("shows only the neighbours of the new entry and counts what it leaves out", () => {
    const others = Array.from({ length: 8 }, (_, i) => seed(`s${i}`, { group: "Sales", order: i * 10 }))

    const { items, before, after } = sidebarGroupPreview(others, { slug: null, title: "New", order: 45 }, "Sales")

    expect(items.map((i) => i.title)).toEqual(["s3", "s4", "New", "s5", "s6"])
    expect(before).toBe(3)
    expect(after).toBe(1)
  })

  it("carries the description of each entry, for the sidebar tooltip", () => {
    const others = [seed("deals", { group: "Sales", description: "Open deals" })]

    const { items } = sidebarGroupPreview(others, { slug: null, title: "New", description: "A new one" }, "Sales")

    expect(items.map((i) => i.description)).toEqual(["Open deals", "A new one"])
  })

  it("matches the default section by an empty group name", () => {
    const others = [seed("plain"), seed("grouped", { group: "Sales" })]

    const { items } = sidebarGroupPreview(others, { slug: null, title: "New" }, "")

    expect(items.map((i) => i.title)).toEqual(["plain", "New"])
  })
})
