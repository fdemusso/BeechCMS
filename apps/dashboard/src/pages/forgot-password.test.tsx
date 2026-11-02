// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import i18n from "i18next"
import { ApiError } from "@/lib/http/api-error"
import { ForgotPasswordPage } from "@/pages/forgot-password/ForgotPasswordPage"

const mocked = vi.hoisted(() => ({ forgotPassword: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { auth: { "forgot-password": { $post: mocked.forgotPassword } } },
}))

function renderComponent() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  )
}

describe("ForgotPasswordPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage("en")
  })

  it("renders translated English labels and content", () => {
    renderComponent()

    expect(screen.getByRole("heading", { level: 1, name: "Forgot password" })).toBeInTheDocument()
    expect(screen.getByText("Enter your email address and we'll send you a reset link.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to login" })).toBeInTheDocument()
  })

  it("renders translated Italian labels and content when language is 'it'", async () => {
    await i18n.changeLanguage("it")
    renderComponent()

    expect(screen.getByRole("heading", { level: 1, name: "Password dimenticata" })).toBeInTheDocument()
    expect(screen.getByText("Inserisci il tuo indirizzo email e ti invieremo un link per reimpostare la password.")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Invia link di reset" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Torna al login" })).toBeInTheDocument()
  })

  it("shows localized validation error on empty or invalid email", async () => {
    const user = userEvent.setup()
    renderComponent()

    const input = screen.getByLabelText("Email")
    await user.type(input, "invalid-email")
    await user.click(screen.getByRole("button", { name: "Send reset link" }))

    expect(screen.getByText("Invalid email address")).toBeInTheDocument()
  })

  it("shows localized success message after successful submission", async () => {
    const user = userEvent.setup()
    mocked.forgotPassword.mockResolvedValueOnce({ json: async () => ({ success: true }) })

    renderComponent()

    const input = screen.getByLabelText("Email")
    await user.type(input, "user@example.com")
    await user.click(screen.getByRole("button", { name: "Send reset link" }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Check your inbox" })).toBeInTheDocument()
      expect(screen.getByText("If an account exists for that email, you'll receive a reset link shortly.")).toBeInTheDocument()
    })
    expect(mocked.forgotPassword).toHaveBeenCalledWith({ json: { email: "user@example.com", locale: "en" } })
  })

  it("shows the same success message when the request fails, so an address cannot be probed", async () => {
    const user = userEvent.setup()
    mocked.forgotPassword.mockRejectedValueOnce(new ApiError(503, null))

    renderComponent()

    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.click(screen.getByRole("button", { name: "Send reset link" }))

    expect(await screen.findByRole("heading", { level: 1, name: "Check your inbox" })).toBeInTheDocument()
  })
})
