// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createCalculatorProvider } from "../../providers/calculator-provider"
import { EXACT_MATCH_SCORE } from "../../lib/rank-palette-items"
import type { PaletteItem, PalettePermissions, PalettePrefix } from "../../types"

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

function itemsFor(query: string, prefix?: PalettePrefix): readonly PaletteItem[] {
  const provider = createCalculatorProvider({ t })
  return provider.getItems({ page: "root", query, prefix, permissions: permissionsFor({}) })
}

describe("createCalculatorProvider", () => {
  it("an un-prefixed compound expression emits one copy row whose value is the result and whose score is EXACT_MATCH_SCORE", () => {
    const items = itemsFor("2025-5")

    expect(items).toHaveLength(1)
    expect(items[0].perform).toEqual({ kind: "copy", value: "2020" })
    expect(items[0].score).toBe(EXACT_MATCH_SCORE)
  })

  it("an un-prefixed lone number emits no row", () => {
    const items = itemsFor("2025")

    expect(items).toEqual([])
  })

  it("with the = prefix a lone operand emits a row", () => {
    const items = itemsFor("-5", "=")

    expect(items).toHaveLength(1)
    expect(items[0].perform).toEqual({ kind: "copy", value: "-5" })
  })

  it("an invalid expression emits no row and does not throw", () => {
    const items = itemsFor("2+*", "=")

    expect(items).toEqual([])
  })

  it("floating-point noise is rounded away", () => {
    const items = itemsFor("0.1+0.2")

    expect(items[0].perform).toEqual({ kind: "copy", value: "0.3" })
  })

  it("the item id is calc:result whatever the query", () => {
    // No query text in ids, per the sprint 1 id contract.
    const ids = ["1+1", "2*3", "10/4"].map((query) => itemsFor(query)[0].id)

    expect(ids).toEqual(["calc:result", "calc:result", "calc:result"])
  })
})
