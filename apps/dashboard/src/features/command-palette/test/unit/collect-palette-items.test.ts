// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { collectPaletteItems } from "../../lib/collect-palette-items"
import type {
  CommandPage,
  PaletteItem,
  PaletteProvider,
  PalettePermissions,
  PaletteQueryContext,
} from "../../types"

type PermissionsPayload = Parameters<typeof hydrateEffectivePermissions>[0]

function permissionsFor(payload: PermissionsPayload): PalettePermissions {
  const effective = hydrateEffectivePermissions(payload)
  return {
    can: (permission, scope) => hasPermission(effective, permission, scope),
    canAnywhere: (permission) => hasPermissionAnywhere(effective, permission),
    canGlobally: (permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
  }
}

function itemWith(id: string, overrides: Partial<PaletteItem> = {}): PaletteItem {
  return {
    id,
    section: "Section",
    label: id,
    icon: () => null,
    perform: { kind: "navigate", to: "/" },
    ...overrides,
  }
}

function providerOf(id: string, pages: CommandPage[], items: PaletteItem[]): PaletteProvider {
  return { id, pages, getItems: () => items }
}

function contextFor(payload: PermissionsPayload, page: CommandPage = "root"): PaletteQueryContext {
  return { page, query: "", permissions: permissionsFor(payload) }
}

const describeMissing = ({ permission }: { permission: string }) => `missing ${permission}`

describe("collectPaletteItems", () => {
  afterEach(() => vi.restoreAllMocks())

  it("only providers listing the current page contribute, in provider order then item order", () => {
    const providers = [
      providerOf("a", ["root"], [itemWith("a:1"), itemWith("a:2")]),
      providerOf("b", ["create"], [itemWith("b:1")]),
      providerOf("c", ["root", "create"], [itemWith("c:1")]),
    ]

    const result = collectPaletteItems(providers, contextFor({}), describeMissing)

    expect(result.map((item) => item.id)).toEqual(["a:1", "a:2", "c:1"])
  })

  it("an item whose requirement fails is returned with the describeMissing text as disabledReason", () => {
    const providers = [
      providerOf("a", ["root"], [itemWith("a:1", { requires: { permission: "content:create", scope: "posts" } })]),
    ]

    const result = collectPaletteItems(providers, contextFor({ byScope: { posts: ["content:read"] } }), describeMissing)

    expect(result).toHaveLength(1)
    expect(result[0].disabledReason).toBe("missing content:create")
  })

  it("a requirement without scope is satisfied by the permission held on any one seed", () => {
    const providers = [providerOf("a", ["root"], [itemWith("a:1", { requires: { permission: "content:create" } })])]

    const result = collectPaletteItems(providers, contextFor({ byScope: { posts: ["content:create"] } }), describeMissing)

    expect(result[0].disabledReason).toBeNull()
  })

  it("a requirement with GLOBAL_SCOPE is not satisfied by the same permission held on one seed only", () => {
    const providers = [
      providerOf("a", ["root"], [itemWith("a:1", { requires: { permission: "content:create", scope: GLOBAL_SCOPE } })]),
    ]

    const result = collectPaletteItems(providers, contextFor({ byScope: { posts: ["content:create"] } }), describeMissing)

    expect(result[0].disabledReason).toBe("missing content:create")
  })

  it("the second item with an already-seen id is dropped and the first is kept", () => {
    const providers = [
      providerOf("a", ["root"], [itemWith("shared:1", { label: "first" })]),
      providerOf("b", ["root"], [itemWith("shared:1", { label: "second" })]),
    ]

    const result = collectPaletteItems(providers, contextFor({}), describeMissing)

    expect(result.map((item) => item.label)).toEqual(["first"])
  })

  it("a provider that throws contributes no rows while the other providers rows are returned", () => {
    // The failure is logged, not asserted on: the contract is that the palette keeps working.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const throwing: PaletteProvider = {
      id: "broken",
      pages: ["root"],
      getItems: () => {
        throw new Error("provider failure")
      },
    }
    const providers = [throwing, providerOf("ok", ["root"], [itemWith("ok:1")])]

    const result = collectPaletteItems(providers, contextFor({}), describeMissing)

    expect(result.map((item) => item.id)).toEqual(["ok:1"])
  })

  it("with a prefix in the context only providers declaring that prefix contribute", () => {
    const calculator: PaletteProvider = { ...providerOf("calc", ["root"], [itemWith("calc:1")]), prefix: "=" }
    const providers = [providerOf("plain", ["root"], [itemWith("plain:1")]), calculator]

    const result = collectPaletteItems(providers, { ...contextFor({}), prefix: "=" }, describeMissing)

    expect(result.map((item) => item.id)).toEqual(["calc:1"])
  })

  it("without a prefix a provider declaring one still contributes", () => {
    const calculator: PaletteProvider = { ...providerOf("calc", ["root"], [itemWith("calc:1")]), prefix: "=" }
    const providers = [calculator, providerOf("plain", ["root"], [itemWith("plain:1")])]

    const result = collectPaletteItems(providers, contextFor({}), describeMissing)

    expect(result.map((item) => item.id)).toEqual(["calc:1", "plain:1"])
  })

  it("with an empty permissions payload every item carrying a requirement is disabled", () => {
    const providers = [
      providerOf("a", ["root"], [
        itemWith("a:any", { requires: { permission: "content:read" } }),
        itemWith("a:global", { requires: { permission: "manage_seeds", scope: GLOBAL_SCOPE } }),
        itemWith("a:scoped", { requires: { permission: "content:create", scope: "posts" } }),
      ]),
    ]

    const result = collectPaletteItems(providers, contextFor(undefined), describeMissing)

    expect(result.map((item) => item.disabledReason !== null)).toEqual([true, true, true])
  })
})
