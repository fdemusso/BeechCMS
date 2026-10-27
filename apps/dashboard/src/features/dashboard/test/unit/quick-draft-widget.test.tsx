// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"
import type { Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const mocked = vi.hoisted(() => ({ schema: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { schema: { $get: mocked.schema } } },
}))

import { api } from "@/lib/api"
import { QuickDraftWidget } from "@/features/dashboard/components/widgets/quick-draft-widget"
import { QuickDraftAdapter } from "@/features/dashboard/registry/builtin/quick-draft-adapters"

const MOCK_SEEDS: Seed[] = [
  {
    slug: "posts",
    label: "Posts",
    displayNameAlias: "title",
    branches: [
      { id: "br_01", alias: "title", type: "text", label: "Title" },
    ],
  } as unknown as Seed,
  {
    slug: "authors",
    label: "Authors",
    displayNameAlias: "name",
    branches: [
      { id: "br_02", alias: "name", type: "text", label: "Name" },
    ],
  } as unknown as Seed,
]

const MOCK_SEED_OPTIONS = [
  {
    slug: "posts",
    label: "Posts",
    displayNameAlias: "title",
    displayNameLabel: "Title",
  },
  {
    slug: "authors",
    label: "Authors",
    displayNameAlias: "name",
    displayNameLabel: "Name",
  },
]

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("QuickDraftWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: "draft_123" } })
  })

  it("submits draft mutation for effective seed when seeds prop resolves after initial empty mount", async () => {
    const { rerender } = renderWithClient(<QuickDraftWidget seeds={[]} />)

    rerender(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter>
          <QuickDraftWidget seeds={MOCK_SEED_OPTIONS} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Async Seed Post")

    const submitBtn = screen.getByRole("button", { name: /create|crea/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/content/posts", {
        status: "draft",
        title: "Async Seed Post",
      })
    })
  })

  it("submits draft mutation through QuickDraftAdapter after useSchema resolves asynchronously", async () => {
    mocked.schema.mockResolvedValue({ json: async () => MOCK_SEEDS })

    renderWithClient(
      <QuickDraftAdapter
        instance={{ id: "w_quick_draft", type: "core/quick-draft", config: {} }}
        config={{}}
      />,
    )

    const input = await screen.findByRole("textbox")
    await userEvent.type(input, "Adapter Seed Post")

    const submitBtn = screen.getByRole("button", { name: /create|crea/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/content/posts", {
        status: "draft",
        title: "Adapter Seed Post",
      })
    })
  })

  it("allows selecting a different seed from dropdown and submitting with chosen seed", async () => {
    renderWithClient(<QuickDraftWidget seeds={MOCK_SEED_OPTIONS} />)

    const selectTrigger = screen.getByRole("combobox")
    await userEvent.click(selectTrigger)
    const authorOption = await screen.findByRole("option", { name: "Authors" })
    await userEvent.click(authorOption)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Jane Doe")

    const submitBtn = screen.getByRole("button", { name: /create|crea/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/content/authors", {
        status: "draft",
        name: "Jane Doe",
      })
    })
  })

  it("disables the submit button and prevents submission when seeds list is empty", async () => {
    renderWithClient(<QuickDraftWidget seeds={[]} />)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Orphan Post")

    const submitBtn = screen.getByRole("button", { name: /create|crea/i })
    expect(submitBtn).toBeDisabled()

    const form = input.closest("form")!
    fireEvent.submit(form)

    expect(api.post).not.toHaveBeenCalled()
  })
})
