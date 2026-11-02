// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import { MemoryRouter, useLocation } from "react-router-dom"
import React from "react"
import type { Seed } from "@beechcms/core"

const mocked = vi.hoisted(() => ({ schema: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { schema: { $get: mocked.schema } } },
}))

vi.mock("@/features/entry-editor", () => ({
  EntryEditorDialog: ({ entryId, schemaSlug, open }: { entryId?: string; schemaSlug: string; open: boolean }) => (
    <div data-testid="entry-editor" data-open={String(open)}>{`${schemaSlug}/${entryId}`}</div>
  ),
}))
vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}))

import { widgetClientFromGet, type WidgetGet } from "@/test/widget-client"
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import { DataTableWidget } from "@/features/dashboard/components/widgets/data-table-widget"

const widgetGet = vi.fn<WidgetGet>()
const widgetClient = widgetClientFromGet((url, config) => widgetGet(url, config))

const seed: Seed = {
  slug: "posts",
  label: "Post",
  displayNameAlias: "title",
  branches: [
    { id: "br_01", alias: "title", type: "text", label: "Title" },
    { id: "br_02", alias: "status", type: "text", label: "Status" },
    { id: "br_03", alias: "secret", type: "text", label: "Secret", policies: { visibility: "hidden" } },
  ],
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>
}

function renderWithProviders(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <WidgetSdkProvider client={widgetClient}>
        <MemoryRouter>
          {ui}
          <CurrentPath />
        </MemoryRouter>
      </WidgetSdkProvider>
    </QueryClientProvider>,
  )
}

/** `GET /schema` goes through rpc; the widget list is read by the SDK client, which is the api client. */
function mockApiGet({ "/schema": seeds, ...responses }: Record<string, unknown>) {
  mocked.schema.mockResolvedValue({ json: async () => seeds })
  ;widgetGet.mockImplementation((url: string) => {
    if (url in responses) return Promise.resolve({ data: responses[url] })
    throw new Error(`Unexpected widget get("${url}")`)
  })
}

describe("DataTableWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the empty state when the seed has no entries", async () => {
    mockApiGet({
      "/schema": [seed],
      "/widget/list/posts": { entries: [], total: 0 },
    })

    renderWithProviders(<DataTableWidget config={{ seedSlug: "posts" }} />)

    await waitFor(() => expect(screen.getByText("No entries")).toBeInTheDocument())
  })

  it("renders configured columns and never shows hidden branch values", async () => {
    mockApiGet({
      "/schema": [seed],
      "/widget/list/posts": {
        entries: [
          { id: "1", slug: "hello-world", status: "published", createdAt: 1000, updatedAt: 1000, title: "Hello World", secret: "TOP-SECRET-VALUE" },
        ],
        total: 1,
      },
    })

    renderWithProviders(<DataTableWidget config={{ seedSlug: "posts", columns: ["title", "status", "secret"] }} />)

    await waitFor(() => expect(screen.getByText("Hello World")).toBeInTheDocument())
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.queryByText("Secret")).not.toBeInTheDocument()
    expect(screen.queryByText("TOP-SECRET-VALUE")).not.toBeInTheDocument()
  })

  it("opens the entry editor over the dashboard on a row double click, without leaving the page", async () => {
    mockApiGet({
      "/schema": [seed],
      "/widget/list/posts": {
        entries: [{ id: "e1", slug: "hello-world", status: "published", createdAt: 1000, updatedAt: 1000, title: "Hello World" }],
        total: 1,
      },
    })
    renderWithProviders(<DataTableWidget config={{ seedSlug: "posts" }} />)
    const cell = await screen.findByText("Hello World")

    fireEvent.doubleClick(cell)

    expect(screen.getByTestId("entry-editor")).toHaveTextContent("posts/e1")
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/)
  })
})
