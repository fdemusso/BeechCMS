// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/http/api-error"
import { AcceptInvitePage } from "@/pages/accept-invite/AcceptInvitePage"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }))

function renderPage(initialPath: string) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AcceptInvitePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("missing token ⇒ invalid-link card", async () => {
    renderPage("/accept-invite")
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it("preview 404 ⇒ invalid-link card", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404, null))
    renderPage("/accept-invite?token=bad-token")
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it("happy path: preview renders, submit posts token and redirects to /login", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { email: "invitee@beech.local", roleName: "Editor", scope: "articles" },
    })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } })

    const user = userEvent.setup()
    renderPage("/accept-invite?token=good-token")

    await waitFor(() => {
      expect(screen.getByDisplayValue("invitee@beech.local")).toBeInTheDocument()
    })

    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    await user.type(passwordInput, "supersecret1")
    await user.type(confirmInput, "supersecret1")

    const submitButton = screen.getByRole("button", { name: /activate account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/invitations/accept",
        expect.objectContaining({ token: "good-token", password: "supersecret1" }),
        { baseURL: "/" },
      )
    })
  })

  it("shows password strength indicator when typing password", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { email: "invitee@beech.local", roleName: "Editor", scope: "articles" },
    })

    const user = userEvent.setup()
    renderPage("/accept-invite?token=good-token")

    await waitFor(() => {
      expect(screen.getByDisplayValue("invitee@beech.local")).toBeInTheDocument()
    })

    const strengthIndicator = screen.getByTestId("password-strength-indicator")
    expect(strengthIndicator).toHaveClass("invisible")

    const passwordInput = screen.getByLabelText(/^password$/i)
    await user.type(passwordInput, "weak")
    expect(strengthIndicator).not.toHaveClass("invisible")
    expect(screen.getByText(/weak|debole/i)).toBeInTheDocument()
  })
})

