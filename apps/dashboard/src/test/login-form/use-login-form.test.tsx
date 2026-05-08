import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  axiosPost: vi.fn(),
  isAxiosError: vi.fn(),
  setToken: vi.fn(),
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocked.navigate,
}))

vi.mock("axios", () => ({
  default: {
    post: mocked.axiosPost,
    isAxiosError: mocked.isAxiosError,
    create: vi.fn().mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}))

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ setToken: mocked.setToken }),
}))

import { useLoginForm } from "@/components/login-form/use-login-form"

const TEST_PASS = "x".repeat(10)

describe("useLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    mocked.axiosPost.mockResolvedValueOnce({ data: { token: "jwt-token", expiresIn: "15m" } })

    const { result } = renderHook(() => useLoginForm())
    act(() => {
      result.current.handleEmailChange({ target: { value: "a@b.com" } } as any)
      result.current.handlePasswordChange({ target: { value: TEST_PASS } } as any)
    })

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as any)
    })

    expect(mocked.axiosPost).toHaveBeenCalledWith(
      "/auth/login",
      { email: "a@b.com", password: TEST_PASS },
      { withCredentials: true }
    )
    expect(mocked.setToken).toHaveBeenCalledWith("jwt-token")
    expect(mocked.navigate).toHaveBeenCalledWith("/", { replace: true })
  })

  it("submit errore 401: mostra messaggio credenziali", async () => {
    mocked.axiosPost.mockRejectedValueOnce({ response: { status: 401 } })
    mocked.isAxiosError.mockReturnValueOnce(true)

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
})
