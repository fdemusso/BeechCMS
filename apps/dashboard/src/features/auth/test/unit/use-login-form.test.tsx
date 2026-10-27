// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  loginPost: vi.fn(),
  setToken: vi.fn(),
  returnTo: null as string | null,
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocked.navigate,
  useSearchParams: () => [{ get: (key: string) => (key === "returnTo" ? mocked.returnTo : null) }],
}))

vi.mock("@/lib/rpc", () => ({ rpc: { auth: { login: { $post: mocked.loginPost } } } }))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ setToken: mocked.setToken }),
}))

import { ApiError } from "@/lib/http/api-error"
import { useLoginForm, safeReturnTo } from "@/features/auth/components/login-form/use-login-form"

function loginResponse(body: { token: string; expiresIn: string }) {
  return { json: async () => body }
}

const TEST_PASS = "x".repeat(10)

describe("useLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.returnTo = null
  })

  it("inizialmente form non valido, toggle password visibile funziona", () => {
    const { result } = renderHook(() => useLoginForm())
    expect(result.current.isFormValid).toBe(false)
    expect(result.current.isPasswordVisible).toBe(false)

    act(() => {
      result.current.togglePasswordVisibility()
    })
    expect(result.current.isPasswordVisible).toBe(true)
  })

  it("validazione: email richiesta / email invalida / password corta", async () => {
    const { result } = renderHook(() => useLoginForm())

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })
    expect(result.current.emailError).toContain("Email is required")

    act(() => {
      result.current.handleEmailChange({ target: { value: "not-an-email" } } as any)
      result.current.handlePasswordChange({ target: { value: TEST_PASS } } as any)
    })
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })
    expect(result.current.emailError).toContain("Invalid email")

    act(() => {
      result.current.handleEmailChange({ target: { value: "a@b.com" } } as any)
      result.current.handlePasswordChange({ target: { value: "123" } } as any)
    })
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })
    expect(result.current.passwordError).toContain("at least 8 characters")
  })

  it("submit successo: chiama setToken e naviga home", async () => {
    mocked.loginPost.mockResolvedValueOnce(loginResponse({ token: "jwt-token", expiresIn: "15m" }))

    const { result } = renderHook(() => useLoginForm())
    act(() => {
      result.current.handleEmailChange({ target: { value: "a@b.com" } } as any)
      result.current.handlePasswordChange({ target: { value: TEST_PASS } } as any)
    })

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })

    expect(mocked.loginPost).toHaveBeenCalledWith({ json: { email: "a@b.com", password: TEST_PASS } })
    expect(mocked.setToken).toHaveBeenCalledWith("jwt-token")
    expect(mocked.navigate).toHaveBeenCalledWith("/", { replace: true })
  })

  it("submit errore 401: mostra messaggio credenziali", async () => {
    mocked.loginPost.mockRejectedValueOnce(new ApiError(401, { error: "Invalid credentials" }))

    const { result } = renderHook(() => useLoginForm())
    act(() => {
      result.current.handleEmailChange({ target: { value: "a@b.com" } } as any)
      result.current.handlePasswordChange({ target: { value: TEST_PASS } } as any)
    })

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })

    expect(result.current.passwordError).toBe("Invalid email or password")
  })

  it("navigates to a validated returnTo path after login", async () => {
    mocked.returnTo = "/oauth/consent?client_id=beech-mcp-cli"
    mocked.loginPost.mockResolvedValueOnce(loginResponse({ token: "jwt-token", expiresIn: "15m" }))

    const { result } = renderHook(() => useLoginForm())
    act(() => {
      result.current.handleEmailChange({ target: { value: "a@b.com" } } as any)
      result.current.handlePasswordChange({ target: { value: TEST_PASS } } as any)
    })
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })

    expect(mocked.navigate).toHaveBeenCalledWith("/oauth/consent?client_id=beech-mcp-cli", { replace: true })
  })
})

describe("safeReturnTo", () => {
  it("falls back to '/' for null, protocol-relative, and absolute URLs", () => {
    expect(safeReturnTo(null)).toBe("/")
    expect(safeReturnTo("//evil.tld")).toBe("/")
    expect(safeReturnTo("https://evil.tld")).toBe("/")
    expect(safeReturnTo("not-a-path")).toBe("/")
  })

  it("accepts a single-slash same-origin path", () => {
    expect(safeReturnTo("/oauth/consent?client_id=x")).toBe("/oauth/consent?client_id=x")
  })
})
