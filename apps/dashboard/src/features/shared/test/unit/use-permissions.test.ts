// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import {
  hydrateEffectivePermissions,
  usePermissions,
} from "@/features/shared/hooks/use-permissions"
import type { EffectivePermissionsPayload } from "@/features/shared/hooks/use-me"

vi.mock("@/features/shared/hooks/use-me", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/shared/hooks/use-me")>()
  return { ...actual, useMe: vi.fn() }
})

import { useMe } from "@/features/shared/hooks/use-me"

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient()
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe("hydrateEffectivePermissions", () => {
  it("rebuilds Sets/Maps from the wire payload (round trip)", () => {
    const payload: EffectivePermissionsPayload = {
      global: ["manage_users"],
      byScope: { articles: ["content:read", "content:update"] },
    }
    const effective = hydrateEffectivePermissions(payload)
    expect(effective.global).toEqual(new Set(["manage_users"]))
    expect(effective.byScope.get("articles")).toEqual(new Set(["content:read", "content:update"]))
  })

  it("undefined payload ⇒ zero-trust default (no authority)", () => {
    const effective = hydrateEffectivePermissions(undefined)
    expect(effective.global.size).toBe(0)
    expect(effective.byScope.size).toBe(0)
  })
})

describe("usePermissions", () => {
  it("can() is true for a scoped grant, and false at GLOBAL_SCOPE ('*') — the asymmetry", () => {
    vi.mocked(useMe).mockReturnValue({
      data: {
        id: "u1", email: "a@b.com", name: null, surname: null, avatarUrl: null,
        notificationPrefs: { contentCreate: true, contentUpdate: true, contentDelete: true, mediaUpload: false },
        permissions: { global: [], byScope: { articles: ["content:read"] } },
        isDeveloper: false,
        manageableScopes: [],
      },
      isLoading: false,
    } as any)

    const { result } = renderHook(() => usePermissions(), { wrapper })
    expect(result.current.can("content:read", "articles")).toBe(true)
    expect(result.current.can("content:read", "*")).toBe(false)
  })

  it("canAnywhere() is true for a scoped-only grant", () => {
    vi.mocked(useMe).mockReturnValue({
      data: {
        id: "u1", email: "a@b.com", name: null, surname: null, avatarUrl: null,
        notificationPrefs: { contentCreate: true, contentUpdate: true, contentDelete: true, mediaUpload: false },
        permissions: { global: [], byScope: { articles: ["manage_users"] } },
        isDeveloper: false,
        manageableScopes: ["articles"],
      },
      isLoading: false,
    } as any)

    const { result } = renderHook(() => usePermissions(), { wrapper })
    expect(result.current.canAnywhere("manage_users")).toBe(true)
    expect(result.current.canGlobally("manage_users")).toBe(false)
  })

  it("undefined payload ⇒ every answer false", () => {
    vi.mocked(useMe).mockReturnValue({ data: undefined, isLoading: false } as any)

    const { result } = renderHook(() => usePermissions(), { wrapper })
    expect(result.current.can("content:read", "articles")).toBe(false)
    expect(result.current.canAnywhere("content:read")).toBe(false)
    expect(result.current.canGlobally("content:read")).toBe(false)
    expect(result.current.isDeveloper).toBe(false)
    expect(result.current.manageableScopes).toEqual([])
  })
})
