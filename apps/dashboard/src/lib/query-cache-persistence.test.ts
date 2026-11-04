// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { createQueryCachePersistence } from "@/lib/query-cache-persistence"

const SCHEMA_KEY = ["schema"] as const
const PROFILE_KEY = ["settings", "profile"] as const
const STORAGE_KEY = "beech_query_cache_v1"

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe("createQueryCachePersistence", () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  function startSession(user: string | null) {
    const client = new QueryClient()
    const persistence = createQueryCachePersistence(client, storage)
    persistence.start([SCHEMA_KEY, PROFILE_KEY])
    if (user !== null) persistence.bindUser(user)
    return { client, persistence }
  }

  it("a reload restores the saved queries with their original age", () => {
    const first = startSession("a@example.com")
    first.client.setQueryData(SCHEMA_KEY, [{ slug: "clienti" }], { updatedAt: 1_000 })
    first.persistence.persistNow()

    const { client: reloaded } = startSession(null)

    expect(reloaded.getQueryData(SCHEMA_KEY)).toEqual([{ slug: "clienti" }])
    expect(reloaded.getQueryState(SCHEMA_KEY)?.dataUpdatedAt).toBe(1_000)
  })

  it("only the allow-listed queries are written", () => {
    const { client, persistence } = startSession("a@example.com")
    client.setQueryData(SCHEMA_KEY, [])
    client.setQueryData(["content", "list", "clienti"], { items: ["private rows"] })

    persistence.persistNow()

    const saved = JSON.parse(storage.items.get(STORAGE_KEY)!) as { entries: Array<{ queryKey: unknown }> }
    expect(saved.entries.map((entry) => entry.queryKey)).toEqual([SCHEMA_KEY])
  })

  it("nothing is written before the signed-in user is known", () => {
    const { client, persistence } = startSession(null)
    client.setQueryData(PROFILE_KEY, { email: "a@example.com" })

    persistence.persistNow()

    expect(storage.items.has(STORAGE_KEY)).toBe(false)
  })

  it("a different user signing in drops what the previous user left", () => {
    const first = startSession("a@example.com")
    first.client.setQueryData(PROFILE_KEY, { email: "a@example.com" })
    first.persistence.persistNow()
    const second = startSession(null)

    second.persistence.bindUser("b@example.com")

    expect(second.client.getQueryData(PROFILE_KEY)).toBeUndefined()
    expect(JSON.parse(storage.items.get(STORAGE_KEY)!).entries).toEqual([])
  })

  it("the same user signing in keeps the restored queries", () => {
    const first = startSession("a@example.com")
    first.client.setQueryData(PROFILE_KEY, { email: "a@example.com" })
    first.persistence.persistNow()
    const second = startSession(null)

    second.persistence.bindUser("a@example.com")

    expect(second.client.getQueryData(PROFILE_KEY)).toEqual({ email: "a@example.com" })
  })

  it("ending the session removes the saved cache", () => {
    const { client, persistence } = startSession("a@example.com")
    client.setQueryData(SCHEMA_KEY, [])
    persistence.persistNow()

    persistence.clear()

    expect(storage.items.has(STORAGE_KEY)).toBe(false)
  })

  it("an unreadable saved cache is ignored", () => {
    storage.items.set(STORAGE_KEY, "{not json")

    const { client } = startSession(null)

    expect(client.getQueryData(SCHEMA_KEY)).toBeUndefined()
  })
})
