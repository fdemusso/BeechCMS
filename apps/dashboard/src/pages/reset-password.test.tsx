// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import i18n from "i18next"
import { ApiError } from "@/lib/http/api-error"
import { ResetPasswordPage } from "@/pages/reset-password/ResetPasswordPage"

const mocked = vi.hoisted(() => ({ resetPassword: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { auth: { "reset-password": { $post: mocked.resetPassword } } },
}))

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("New password"), "a-valid-password")
  await user.type(screen.getByLabelText("Confirm password"), "a-valid-password")
  await user.click(screen.getByRole("button", { name: "Reset password" }))
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResetPasswordPage />
    </MemoryRouter>
  )
}

describe("ResetPasswordPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage("en")
  })

  it("posts the token from the link with the new password and the UI language", async () => {
    mocked.resetPassword.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    const user = userEvent.setup()
    renderPage("/reset-password?token=plain-token")

    await fillAndSubmit(user)

    expect(mocked.resetPassword).toHaveBeenCalledWith({
      json: { token: "plain-token", password: "a-valid-password", locale: "en" },
    })
  })

  it("a 400 from the server shows the invalid-or-expired message", async () => {
    mocked.resetPassword.mockRejectedValueOnce(new ApiError(400, { error: "Invalid or expired token" }))
    const user = userEvent.setup()
    renderPage("/reset-password?token=stale-token")

    await fillAndSubmit(user)

    expect(await screen.findByText("This reset link is invalid or has expired")).toBeInTheDocument()
  })

  it("any other failure shows the generic message", async () => {
    mocked.resetPassword.mockRejectedValueOnce(new ApiError(503, { error: "Service not available" }))
    const user = userEvent.setup()
    renderPage("/reset-password?token=plain-token")

    await fillAndSubmit(user)

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument()
  })

  it("without a token in the link nothing is sent and a new link is offered", () => {
    renderPage("/reset-password")

    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument()
    expect(mocked.resetPassword).not.toHaveBeenCalled()
  })
})
