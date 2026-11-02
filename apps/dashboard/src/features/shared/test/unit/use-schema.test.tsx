// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import { getSeed, SEED_REGISTRY } from "@beechcms/core"
import { CANONICAL_SEEDS } from "@beechcms/testing"

const mocked = vi.hoisted(() => ({ schema: vi.fn() }))

vi.mock("@/lib/rpc", () => ({ rpc: { api: { schema: { $get: mocked.schema } } } }))

import { useSchema } from "@/features/shared/hooks/use-schema"

const [keptSeed, deletedSeed] = CANONICAL_SEEDS

describe("useSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The registry is a process-wide singleton; start every test from an empty one.
    for (const slug of Object.keys(SEED_REGISTRY)) delete SEED_REGISTRY[slug]
  })

  it("drops a seed from the core registry once a refetched schema no longer lists it", async () => {
    mocked.schema.mockResolvedValueOnce({ json: async () => [keptSeed, deletedSeed] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
    const { result } = renderHook(() => useSchema(), { wrapper })
    await waitFor(() => expect(getSeed(deletedSeed.slug)).not.toBeNull())
    mocked.schema.mockResolvedValueOnce({ json: async () => [keptSeed] })

    await result.current.refetch()

    await waitFor(() => expect(getSeed(deletedSeed.slug)).toBeNull())
    expect(getSeed(keptSeed.slug)).not.toBeNull()
  })
})
