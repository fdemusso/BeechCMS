// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TFunction } from "i18next"
import { CANONICAL_ENTRIES, CANONICAL_SEEDS, CANONICAL_USERS } from "@beechcms/testing"
import { GLOBAL_SCOPE, hasPermission, hasPermissionAnywhere } from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import { createContentSearchProvider } from "../../providers/content-search-provider"
import type { PalettePermissions, PaletteQueryContext } from "../../types"

const mocked = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock("@/lib/rpc", () => ({ rpc: { api: { search: { $get: mocked.search } } } }))

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
const formatUpdatedAt = (unixSeconds: number) => `at ${unixSeconds}`

const READER: PermissionsPayload = { byScope: { posts: ["content:read"] } }
const HIT_ID = "0c1f6d36-9c8a-4a78-8c2e-3f2f4f6a1b11"
const UPDATED_AT = 1_700_000_000

// The HTTP response shape: this is the boundary being mocked.
function hit(overrides: Record<string, unknown> = {}) {
  return {
    id: HIT_ID,
    schema_slug: "posts",
    slug: "canonical-post",
    status: "published",
    updated_at: UPDATED_AT,
    author_name: CANONICAL_USERS.editor.name,
    title: String(CANONICAL_ENTRIES[0].data.title),
    excerpt: "",
    data: {},
    ...overrides,
  }
}

function respondWith(...hits: ReturnType<typeof hit>[]) {
  mocked.search.mockResolvedValueOnce({ json: async () => ({ items: hits, nextCursor: null, total: hits.length }) })
}

function contextFor(payload: PermissionsPayload, query = "canonical"): PaletteQueryContext {
  return { page: "root", query, prefix: "/", permissions: permissionsFor(payload) }
}

function createProvider(seeds = CANONICAL_SEEDS) {
  return createContentSearchProvider({ t, seeds, formatUpdatedAt })
}

describe("createContentSearchProvider", () => {
  beforeEach(() => vi.clearAllMocks())

  it("without content:read on any scope it resolves to no rows and sends no request", async () => {
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor({}), new AbortController().signal)

    expect(rows).toEqual([])
    expect(mocked.search).not.toHaveBeenCalled()
  })

  it("it requests the context's query with limit \"8\" and forwards the given signal in init", async () => {
    respondWith(hit())
    const provider = createProvider()
    const { signal } = new AbortController()

    await provider.fetchItems(contextFor(READER, "canonical"), signal)

    expect(mocked.search).toHaveBeenCalledWith(
      { query: { q: "canonical", limit: "8" } },
      { init: { signal } },
    )
  })

  it("a hit maps to a row with the entry id, title, seed label, status, author and date, and a navigate perform", async () => {
    respondWith(hit())
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: `search:${HIT_ID}`,
      label: "Canonical Post",
      section: "Post",
      status: "published",
      description: `${CANONICAL_USERS.editor.name} · at ${UPDATED_AT}`,
      perform: { kind: "navigate", to: `/content/posts/${HIT_ID}` },
    })
  })

  it("each hit row carries one Copy ID action whose copy value is the hit id", async () => {
    respondWith(hit())
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows[0].actions).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actions: [{ id: "copy-id", perform: { kind: "copy", value: HIT_ID } }],
    })
  })

  it("a hit whose author_name is null has only the formatted date as description", async () => {
    respondWith(hit({ author_name: null }))
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows[0].description).toBe(`at ${UPDATED_AT}`)
  })

  it("a hit with an empty title is labelled with the untitled text", async () => {
    respondWith(hit({ title: "  " }))
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows[0].label).toBe("commandPalette.untitledEntry")
  })

  it("a hit whose status the badge does not know carries no status", async () => {
    respondWith(hit({ status: "mystery" }))
    const provider = createProvider()

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows[0].status).toBeUndefined()
  })

  it("a hit of a seed missing from the schema uses its slug as the section", async () => {
    respondWith(hit({ schema_slug: "ghosts" }))
    const provider = createProvider([])

    const rows = await provider.fetchItems(contextFor(READER), new AbortController().signal)

    expect(rows[0].section).toBe("ghosts")
  })

  it("a failing request rejects with the same error", async () => {
    // The lane drops the source on rejection; the provider must not swallow it.
    const failure = new Error("network down")
    mocked.search.mockRejectedValueOnce(failure)
    const provider = createProvider()

    const outcome = provider.fetchItems(contextFor(READER), new AbortController().signal)

    await expect(outcome).rejects.toBe(failure)
  })
})
