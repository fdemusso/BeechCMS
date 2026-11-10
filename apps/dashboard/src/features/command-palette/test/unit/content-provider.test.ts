// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere, type Seed } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createContentProvider } from "../../providers/content-provider"
import type { CommandPage, PaletteItem, PalettePermissions } from "../../types"

type PermissionsPayload = Parameters<typeof hydrateEffectivePermissions>[0]

function permissionsFor(payload: PermissionsPayload): PalettePermissions {
  const effective = hydrateEffectivePermissions(payload)
  return {
    can: (permission, scope) => hasPermission(effective, permission, scope),
    canAnywhere: (permission) => hasPermissionAnywhere(effective, permission),
    canGlobally: (permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
  }
}

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${Object.values(options).join(" ")}` : key) as unknown as TFunction

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

// Canonical seeds are only three, so the list is padded with distinct slugs copied from posts.
function paddedSeeds(count: number): Seed[] {
  return Array.from({ length: count }, (_, index) => ({ ...posts, slug: `posts-${index}` }))
}

function readableByScope(seeds: readonly Seed[]): PermissionsPayload {
  return { byScope: Object.fromEntries(seeds.map((seed) => [seed.slug, ["content:read" as const]])) }
}

function itemsFor(
  seeds: readonly Seed[],
  payload: PermissionsPayload,
  page: CommandPage = "root",
  query = "",
): readonly PaletteItem[] {
  const provider = createContentProvider({ t, seeds })
  return provider.getItems({ page, query, permissions: permissionsFor(payload) })
}

describe("createContentProvider", () => {
  it("a seed the caller cannot content:read emits no row on any page", () => {
    const pages: CommandPage[] = ["root", "seeds", "create"]

    const rows = pages.map((page) => itemsFor(CANONICAL_SEEDS, {}, page))

    expect(rows.map((items) => items.length)).toEqual([0, 0, 0])
  })

  it("the idle root page caps Go to rows at five and adds All content types above five readable seeds", () => {
    const seeds = paddedSeeds(6)

    const idleRows = itemsFor(seeds, readableByScope(seeds))

    const goToIds = idleRows.filter((item) => item.id.startsWith("content:open:")).map((item) => item.id)
    expect(goToIds).toHaveLength(5)
    expect(idleRows.map((item) => item.id)).toContain("content:all")
  })

  it("the idle root page does not add All content types at exactly five readable seeds", () => {
    const seeds = paddedSeeds(5)

    const idleRows = itemsFor(seeds, readableByScope(seeds))

    expect(idleRows.map((item) => item.id)).not.toContain("content:all")
  })

  it("a create-page row for a seed without content:create on that slug carries the requirement", () => {
    const items = itemsFor([posts], { byScope: { posts: ["content:read"] } }, "create")

    expect(items).toHaveLength(1)
    expect(items[0].requires).toEqual({ permission: "content:create", scope: "posts" })
  })

  it("a seed with dashboard.hidden emits no row", () => {
    const hiddenPosts: Seed = { ...posts, dashboard: { ...posts.dashboard, hidden: true } }

    const items = itemsFor([hiddenPosts], { byScope: { posts: ["content:read"] } })

    expect(items).toEqual([])
  })

  it("New content is not emitted when no seed is readable", () => {
    const items = itemsFor(CANONICAL_SEEDS, { global: ["view_analytics"] })

    expect(items.map((item) => item.id)).not.toContain("content:new")
  })

  it("item ids contain the slug and no translated text", () => {
    const payload: PermissionsPayload = { byScope: { posts: ["content:read", "content:create"] } }

    const rootIds = itemsFor([posts], payload).map((item) => item.id)
    const createIds = itemsFor([posts], payload, "create").map((item) => item.id)

    expect(rootIds).toEqual(["content:open:posts", "content:new"])
    expect(createIds).toEqual(["content:create:posts"])
  })
})
