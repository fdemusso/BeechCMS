import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("@/components/login-form/use-login-form", () => ({
  useLoginForm: () => ({
    emailValue: "admin@beech.local",
    passwordValue: "x".repeat(10),
    isPasswordVisible: false,
    emailError: null,
    passwordError: null,
    isLoading: false,
    isFormValid: true,
    handleEmailChange: vi.fn(),
    handlePasswordChange: vi.fn(),
    togglePasswordVisibility: vi.fn(),
    handleSubmit: vi.fn((e: Event) => e.preventDefault()),
  }),
}))

import { LoginForm } from "@/components/login-form/login-form"

describe("LoginForm", () => {
  it("renderizza titolo, campi e bottone login abilitato", () => {
    render(<LoginForm />)

    expect(screen.getByText("Welcome back")).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    const btn = screen.getByRole("button", { name: /login/i })
    expect(btn).toBeEnabled()
  })

  it("inoltra submit del form", () => {
    render(<LoginForm />)
    const form = screen.getByRole("button", { name: /login/i }).closest("form")
    expect(form).toBeInTheDocument()
    if (!form) throw new Error("Form non trovato")
    fireEvent.submit(form)
    expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument()
  })
})

