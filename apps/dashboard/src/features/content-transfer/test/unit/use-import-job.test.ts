// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"

vi.mock("../../api/transfer.api", () => ({
  fetchImportJob: vi.fn(),
  isTerminalState: (state: string | undefined) => state === "completed" || state === "failed",
}))

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")
  return { ...actual, useQuery: vi.fn(actual.useQuery) }
})

import { useImportJob } from "../../hooks/use-import-job"
import { fetchImportJob } from "../../api/transfer.api"

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

describe("useImportJob", () => {
  beforeEach(() => vi.clearAllMocks())

  it("leaves the query disabled and fetchImportJob uncalled for a null jobId", () => {
    const { result } = renderHook(() => useImportJob(null), { wrapper: makeWrapper() })

    expect(result.current.fetchStatus).toBe("idle")
    expect(fetchImportJob).not.toHaveBeenCalled()
  })

  it("computes a numeric interval while processing and false once completed", () => {
    renderHook(() => useImportJob("job-1"), { wrapper: makeWrapper() })

    const options = vi.mocked(useQuery).mock.calls[0][0] as {
      refetchInterval: (query: { state: { data: { state: string } | undefined } }) => number | false
    }

    expect(options.refetchInterval({ state: { data: { state: "processing" } } })).toBe(2_000)
    expect(options.refetchInterval({ state: { data: { state: "completed" } } })).toBe(false)
  })

  it("surfaces a rejected fetch as an error without retrying", async () => {
    vi.mocked(fetchImportJob).mockRejectedValueOnce(new Error("not found"))

    const { result } = renderHook(() => useImportJob("job-1"), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchImportJob).toHaveBeenCalledOnce()
  })
})
