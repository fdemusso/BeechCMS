// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { TFunction } from "i18next"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createNavigationProvider } from "../../providers/navigation-provider"
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

const t = ((key: string) => key) as unknown as TFunction

function itemsFor(payload: PermissionsPayload, query = ""): readonly PaletteItem[] {
  const provider = createNavigationProvider({ t })
  return provider.getItems({ page: "root", query, permissions: permissionsFor(payload) })
}

describe("createNavigationProvider", () => {
  it("with no authority only the Dashboard row and the Settings row are emitted", () => {
    const items = itemsFor(undefined)

    expect(items.map((item) => item.id)).toEqual(["nav:/", "nav:settings"])
  })

  it("view_analytics on * adds the Analytics row and manage_seeds on * adds the Content Types row", () => {
    const items = itemsFor({ global: ["view_analytics", "manage_seeds"] })

    expect(items.map((item) => item.id)).toEqual(["nav:/", "nav:/analytics", "nav:/schema", "nav:settings"])
  })

  it("content:read on one seed adds Drafts and never emits a not-implemented page", () => {
    const items = itemsFor({ byScope: { posts: ["content:read"] } })

    const ids = items.map((item) => item.id)
    expect(ids).toContain("nav:/drafts")
    expect(ids).not.toContain("nav:/content/create-new")
    expect(ids).not.toContain("nav:/scheduled")
  })

  it("the Settings row is absent while the query is non-empty", () => {
    const items = itemsFor({ global: ["view_analytics"] }, "dash")

    expect(items.map((item) => item.id)).not.toContain("nav:settings")
  })

  it("no row navigates to /media", () => {
    // Regression guard: /media has no route, the old hand-written row led to a dead page.
    const items = itemsFor({ global: ["view_analytics", "manage_seeds"], byScope: { posts: ["content:read"] } })

    const targets = items.map((item) => (item.perform.kind === "navigate" ? item.perform.to : null))
    expect(targets).not.toContain("/media")
  })
})
