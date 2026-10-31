// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"

const mocked = vi.hoisted(() => ({ me: vi.fn(), schema: vi.fn(), layout: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: {
    settings: { me: { $get: mocked.me } },
    schema: { $get: mocked.schema },
    "dashboard-layout": { $get: mocked.layout },
  } },
}))

vi.mock("@/features/navigation", () => ({
  AppSidebar: () => null,
  SiteHeader: () => null,
}))

// A legacy admin JWT is used on purpose, so a regression back to the role-based gate fails these tests.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { email: "ada@example.com", name: "Ada", role: "admin" } }),
}))

import { ME_QUERY_KEY } from "@/features/shared/hooks/use-me"
import DashboardPage from "@/features/dashboard/pages/dashboard-page"

const USER_ID = "0f6c2d1e-8b34-4a57-9e10-3c4d5e6f7a81"

function meBody(permissions: { global: string[]; byScope: Record<string, string[]> }) {
  return {
    id: USER_ID,
    email: "ada@example.com",
    name: "Ada",
    surname: null,
    avatarUrl: null,
    notificationPrefs: { contentCreate: true, contentUpdate: true, contentDelete: true, mediaUpload: false },
    permissions,
    isDeveloper: false,
    manageableScopes: [],
  }
}

function renderPage(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return client
}

/** The greeting name comes from the JWT user, so it renders before `me` does; wait on the query itself. */
async function waitForMe(client: QueryClient) {
  await waitFor(() => expect(client.getQueryState(ME_QUERY_KEY)?.status).toBe("success"))
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.schema.mockResolvedValue({ json: async () => [] })
    mocked.layout.mockResolvedValue({ json: async () => ({ layout: null }) })
  })

  it("shows the Customize button once me reports manage_roles in global", async () => {
    mocked.me.mockResolvedValue({ json: async () => meBody({ global: ["manage_roles"], byScope: {} }) })

    renderPage()

    expect(await screen.findByRole("button", { name: "Customize" })).toBeInTheDocument()
  })

  it("never shows the Customize button when me reports no manage_roles, even for an admin JWT", async () => {
    mocked.me.mockResolvedValue({ json: async () => meBody({ global: ["content:read"], byScope: {} }) })

    const client = renderPage()
    await waitForMe(client)

    expect(screen.queryByRole("button", { name: "Customize" })).not.toBeInTheDocument()
  })

  it("never shows the Customize button when me reports manage_roles only under a seed scope", async () => {
    mocked.me.mockResolvedValue({
      json: async () => meBody({ global: [], byScope: { posts: ["manage_roles"] } }),
    })

    const client = renderPage()
    await waitForMe(client)

    expect(screen.queryByRole("button", { name: "Customize" })).not.toBeInTheDocument()
  })
})
