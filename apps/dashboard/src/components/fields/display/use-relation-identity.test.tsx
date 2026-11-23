// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ApiError } from "@/lib/http/api-error"
import { FieldsProvider, type FieldsContextType } from "../context"
import { useRelationIdentity } from "./relation-identity"

const ENTRY_ID = "3f2a9c1e-77b4-4d0e-9a51-0c6d2e8b41ab"

function wrapperFor(fetchById: FieldsContextType["fetchById"]) {
  const fieldsConfig = {
    useSchema: () => ({ data: [{ slug: "clienti", displayNameAlias: "name", branches: [] }] }),
    useLocaleConfig: () => undefined,
    fetchById,
    queryKeys: { detail: (slug: string, id: string) => ["detail", slug, id] },
  } as unknown as FieldsContextType
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FieldsProvider value={fieldsConfig}>{children}</FieldsProvider>
    </QueryClientProvider>
  )
}

describe("useRelationIdentity", () => {
  it("shows a neutral placeholder instead of the raw id when the entry is refused with 403", async () => {
    const wrapper = wrapperFor(async () => {
      throw new ApiError(403, null)
    })

    const { result } = renderHook(() => useRelationIdentity("clienti", ENTRY_ID, "name"), { wrapper })

    await waitFor(() => expect(result.current.isForbidden).toBe(true))
    expect(result.current.label).toBe("Record not accessible")
    expect(result.current.label).not.toContain(ENTRY_ID)
    expect(result.current.isLoading).toBe(false)
  })

  it("keeps the id fallback when the request fails for a reason other than 403", async () => {
    const wrapper = wrapperFor(async () => {
      throw new ApiError(500, null)
    })

    const { result } = renderHook(() => useRelationIdentity("clienti", ENTRY_ID, "name"), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isForbidden).toBe(false)
    expect(result.current.label).toBe(ENTRY_ID)
  })

  it("shows the display name when the entry is readable", async () => {
    const wrapper = wrapperFor(async (_slug, id) => ({ id, data: { name: "Mario Rossi" } }) as never)

    const { result } = renderHook(() => useRelationIdentity("clienti", ENTRY_ID, "name"), { wrapper })

    await waitFor(() => expect(result.current.label).toBe("Mario Rossi"))
    expect(result.current.isForbidden).toBe(false)
  })
})
