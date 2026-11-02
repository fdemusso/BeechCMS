// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"

const mocked = vi.hoisted(() => ({ list: vi.fn(), publish: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { content: { ":slug": { $get: mocked.list, ":id": { draft: { publish: { $post: mocked.publish } } } } } } },
}))

import { PendingDraftsWidget } from "../../components/widgets/pending-drafts-widget"

const ENTRY_ID = "5b0a6b3e-2f4e-4c1a-9a53-0c9d3f1e7a01"

describe("PendingDraftsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.list.mockResolvedValue({
      json: async () => ({
        items: [{ id: ENTRY_ID, slug: "a-post", status: "published", data: { title: "A post" }, created_at: 1, updated_at: 2, has_pending_draft: true }],
        total: 1,
        page: 1,
        limit: 10,
        relations: {},
      }),
    })
    mocked.publish.mockResolvedValue({ json: async () => ({ success: true }) })
  })

  it("asks for the first ten entries of the seed with a pending draft", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PendingDraftsWidget seedSlug="posts" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findAllByRole("button", { name: "Publish" })

    expect(mocked.list).toHaveBeenCalledWith({ param: { slug: "posts" }, query: { has_pending_draft: "1", limit: "10" } })
  })

  it("publishing an entry posts to its draft publish route", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PendingDraftsWidget seedSlug="posts" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const [publishButton] = await screen.findAllByRole("button", { name: "Publish" })

    await userEvent.click(publishButton)

    await waitFor(() => expect(mocked.publish).toHaveBeenCalledTimes(1))
    expect(mocked.publish).toHaveBeenCalledWith({ param: { slug: "posts", id: ENTRY_ID } })
  })
})
