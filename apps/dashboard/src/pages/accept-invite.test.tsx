// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@/lib/http/api-error"
import { AcceptInvitePage } from "@/pages/accept-invite/AcceptInvitePage"

const mocked = vi.hoisted(() => ({ preview: vi.fn(), accept: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { auth: { invitations: { ":token": { $get: mocked.preview }, accept: { $post: mocked.accept } } } },
}))

const INVITEE = { email: "invitee@beech.local", roleName: "Editor", scope: "articles" }

function previewResponse(body: typeof INVITEE) {
  return { json: async () => body }
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByDisplayValue(INVITEE.email)).toBeInTheDocument()
  })
  await user.type(screen.getByLabelText(/^password$/i), "supersecret1")
  await user.type(screen.getByLabelText(/confirm password/i), "supersecret1")
  await user.click(screen.getByRole("button", { name: /activate account/i }))
}

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
    mocked.preview.mockRejectedValueOnce(new ApiError(404, null))
    renderPage("/accept-invite?token=bad-token")
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
    expect(mocked.preview).toHaveBeenCalledWith({ param: { token: "bad-token" } })
  })

  it("happy path: preview renders, submit posts token and redirects to /login", async () => {
    mocked.preview.mockResolvedValueOnce(previewResponse(INVITEE))
    mocked.accept.mockResolvedValueOnce({ json: async () => ({ id: "u1", email: INVITEE.email }) })

    const user = userEvent.setup()
    renderPage("/accept-invite?token=good-token")
    await fillAndSubmit(user)

    await waitFor(() => {
      expect(mocked.accept).toHaveBeenCalledWith({
        json: expect.objectContaining({ token: "good-token", password: "supersecret1" }),
      })
    })
  })

  it.each([
    ["invitation-invalid", /invalid or has expired/i],
    ["invitation-revoked", /invalid or has expired/i],
    ["email-taken", /account with this email already exists/i],
    ["validation-failed", /at least 8 characters/i],
  ])("accept refused with %s shows its own message", async (code, message) => {
    mocked.preview.mockResolvedValueOnce(previewResponse(INVITEE))
    mocked.accept.mockRejectedValueOnce(new ApiError(409, { type: `https://beechcms.dev/problems/${code}` }))

    const user = userEvent.setup()
    renderPage("/accept-invite?token=good-token")
    await fillAndSubmit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it("shows password strength indicator when typing password", async () => {
    mocked.preview.mockResolvedValueOnce(previewResponse(INVITEE))

    const user = userEvent.setup()
    renderPage("/accept-invite?token=good-token")

    await waitFor(() => {
      expect(screen.getByDisplayValue(INVITEE.email)).toBeInTheDocument()
    })

    const strengthIndicator = screen.getByTestId("password-strength-indicator")
    expect(strengthIndicator).toHaveClass("invisible")

    const passwordInput = screen.getByLabelText(/^password$/i)
    await user.type(passwordInput, "weak")
    expect(strengthIndicator).not.toHaveClass("invisible")
    expect(screen.getByText(/weak|debole/i)).toBeInTheDocument()
  })
})

