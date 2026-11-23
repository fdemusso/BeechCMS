// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query"
import { ApiError } from "./http/api-error"
import { watchForbidden } from "./forbidden-refresh"

const SCHEMA_KEY: QueryKey = ["schema"]
const ME_KEY: QueryKey = ["settings", "profile"]
const DETAIL_KEY: QueryKey = ["content", "detail", "clienti", "c-1"]

describe("watchForbidden", () => {
  let client: QueryClient
  let clock: number
  let schemaFn: Mock<() => Promise<unknown>>
  let meFn: Mock<() => Promise<unknown>>
  const unsubscribe: Array<() => void> = []

  /** Keeps a query active (as a mounted component would) so an invalidation refetches it. */
  function observe(queryKey: QueryKey, queryFn: () => Promise<unknown>): void {
    const observer = new QueryObserver(client, { queryKey, queryFn, staleTime: Infinity })
    unsubscribe.push(observer.subscribe(() => {}))
  }

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    clock = 1_000_000
    schemaFn = vi.fn<() => Promise<unknown>>(async () => ["seeds"])
    meFn = vi.fn<() => Promise<unknown>>(async () => ({ permissions: [] }))
    watchForbidden(client, [SCHEMA_KEY, ME_KEY], () => clock)
    observe(SCHEMA_KEY, schemaFn)
    observe(ME_KEY, meFn)
  })

  afterEach(() => {
    for (const stop of unsubscribe.splice(0)) stop()
    client.clear()
  })

  it("a 403 on an entry detail refetches the schema, the profile and the failed detail", async () => {
    const detailFn = vi.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new ApiError(403, null))
      .mockResolvedValueOnce({ data: { name: "Acme" } })

    observe(DETAIL_KEY, detailFn)

    await vi.waitFor(() => expect(client.getQueryData(DETAIL_KEY)).toEqual({ data: { name: "Acme" } }))
    expect(schemaFn).toHaveBeenCalledTimes(2)
    expect(meFn).toHaveBeenCalledTimes(2)
  })

  it("a non-403 failure leaves the permission caches alone", async () => {
    const detailFn = vi.fn<() => Promise<unknown>>().mockRejectedValue(new ApiError(500, null))

    observe(DETAIL_KEY, detailFn)

    await vi.waitFor(() => expect(client.getQueryState(DETAIL_KEY)?.status).toBe("error"))
    expect(schemaFn).toHaveBeenCalledTimes(1)
    expect(meFn).toHaveBeenCalledTimes(1)
  })

  it("a 403 that survives the refresh is retried once, not in a loop", async () => {
    const detailFn = vi.fn<() => Promise<unknown>>().mockRejectedValue(new ApiError(403, null))

    observe(DETAIL_KEY, detailFn)

    await vi.waitFor(() => expect(detailFn).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(detailFn).toHaveBeenCalledTimes(2)
    expect(schemaFn).toHaveBeenCalledTimes(2)
  })

  it("a 403 on a permission query itself does not trigger a refresh", async () => {
    const failing = vi.fn<() => Promise<unknown>>().mockRejectedValue(new ApiError(403, null))

    const forbiddenMe = new QueryObserver(client, { queryKey: ME_KEY, queryFn: failing, staleTime: 0 })
    unsubscribe.push(forbiddenMe.subscribe(() => {}))

    await vi.waitFor(() => expect(failing).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(schemaFn).toHaveBeenCalledTimes(1)
  })
})
