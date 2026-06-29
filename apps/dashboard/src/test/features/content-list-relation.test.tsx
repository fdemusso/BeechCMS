// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Integration test: verifies that the N+1 mitigation strategy works correctly.
 * The list response embeds a `relations` map; the hook primes the TanStack cache,
 * allowing RelationDisplay to render synchronously without firing per-row requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock("@/features/shared", () => ({
  useSchema: vi.fn(),
  useActiveSeed: vi.fn(),
}))

import { api } from "@/lib/api"
import { useSchema } from "@/features/shared"
import { useContentList } from "@/features/content-management/hooks/use-content-list"
import { RelationDisplay } from "@/features/fields/display/relation"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // gcTime must be > 0 so setQueryData entries without observers aren't
      // immediately garbage-collected before our assertions run.
      queries: { retry: false, gcTime: 5000 },
    },
  })
}

const articlesSeed = {
  slug: "articles",
  label: "Articles",
  displayNameAlias: "title",
  branches: [
    { id: "br_01", alias: "title", label: "Title", type: "text" },
    { id: "br_02", alias: "author_id", label: "Author", type: "relation", targetSeed: "team" },
  ],
}

const teamSeed = {
  slug: "team",
  label: "Team",
  displayNameAlias: "name",
  branches: [{ id: "br_01", alias: "name", label: "Name", type: "text" }],
}

const listResponseWithRelations = {
  items: [
    {
      id: "article-1",
      schema_slug: "articles",
      slug: "hello-world",
      status: "published",
      data: { title: "Hello World", author_id: "team-1" },
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "article-2",
      schema_slug: "articles",
      slug: "second",
      status: "published",
      data: { title: "Second Post", author_id: "team-2" },
      created_at: 1000,
      updated_at: 1000,
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  relations: {
    author_id: {
      "team-1": "Ada Lovelace",
      "team-2": "Grace Hopper",
    },
  },
}

describe("useContentList — cache priming from relations", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [articlesSeed, teamSeed],
      isLoading: false,
    })
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: listResponseWithRelations,
    })
  })

  it("primes relation detail caches after list fetch", async () => {
    const { result } = renderHook(
      () => useContentList("articles", { page: 1, limit: 10 }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Flush useEffect (runs after React commit)
    await act(async () => {})

    const team1Cache = queryClient.getQueryData(CONTENT_QUERY_KEYS.detail("team", "team-1"))
    const team2Cache = queryClient.getQueryData(CONTENT_QUERY_KEYS.detail("team", "team-2"))

    expect(team1Cache).toBeDefined()
    expect((team1Cache as any)?.data?.name).toBe("Ada Lovelace")

    expect(team2Cache).toBeDefined()
    expect((team2Cache as any)?.data?.name).toBe("Grace Hopper")
  })
})

describe("RelationDisplay — resolves from primed cache synchronously", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = makeQueryClient()
    ;(useSchema as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [articlesSeed, teamSeed],
      isLoading: false,
    })
  })

  it("renders human label from primed cache without firing fetchById", () => {
    // Prime the cache manually (simulates what useContentList does)
    queryClient.setQueryData(CONTENT_QUERY_KEYS.detail("team", "team-1"), {
      id: "team-1",
      schema_slug: "team",
      slug: null,
      status: "published",
      data: { name: "Ada Lovelace" },
      created_at: null,
      updated_at: null,
    })

    const branch = {
      id: "br_02",
      alias: "author_id",
      label: "Author",
      type: "relation",
      targetSeed: "team",
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RelationDisplay branch={branch as any} value="team-1" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Label resolves synchronously — no loading state
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()

    // No extra fetchById calls fired
    expect(api.get).not.toHaveBeenCalled()
  })
})
