// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createConversionsProvider } from "../../providers/conversions-provider"
import type { PaletteItem, PalettePermissions } from "../../types"

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

function itemsFor(query: string): readonly PaletteItem[] {
  const provider = createConversionsProvider({ t })
  return provider.getItems({ page: "root", query, permissions: permissionsFor({}) })
}

describe("createConversionsProvider", () => {
  it("a CSS conversion emits one copy row with the to value and the base in its description", () => {
    const items = itemsFor("16px")

    expect(items).toHaveLength(1)
    expect(items[0].perform).toEqual({ kind: "copy", value: "1rem" })
    expect(items[0].description).toBe("commandPalette.conversionHint.css 16")
  })

  it("a storage, colour and timestamp input each emit one row whose id is convert:<kind>", () => {
    const cases: [string, string][] = [
      ["1 GB", "convert:storage"],
      ["#ff0000", "convert:color"],
      ["1700000000", "convert:unix-seconds"],
      ["1700000000000", "convert:unix-millis"],
    ]

    const ids = cases.map(([query]) => itemsFor(query).map((item) => item.id))

    expect(ids).toEqual(cases.map(([, id]) => [id]))
  })

  it("an unrecognised input emits no row", () => {
    const items = itemsFor("posts")

    expect(items).toEqual([])
  })
})
