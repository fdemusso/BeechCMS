// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const useRouteErrorMock = vi.fn()
const isRouteErrorResponseMock = vi.fn()

vi.mock("react-router-dom", () => ({
  useRouteError: () => useRouteErrorMock(),
  isRouteErrorResponse: (e: unknown) => isRouteErrorResponseMock(e),
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { ErrorPage } from "@/pages/error-page"

describe("ErrorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("mostra status e statusText per route error response", () => {
    useRouteErrorMock.mockReturnValueOnce({
      status: 404,
      statusText: "Not Found",
      data: {},
    })
    isRouteErrorResponseMock.mockReturnValueOnce(true)

    render(<ErrorPage />)
    expect(screen.getByText("404")).toBeInTheDocument()
    expect(screen.getByText("Not Found")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Back to home/i })).toHaveAttribute("href", "/")
  })

  it("il testo del bottone vince sulla regola globale `a { color }` (altrimenti nero su nero)", () => {
    useRouteErrorMock.mockReturnValueOnce(new Error("Custom error"))
    isRouteErrorResponseMock.mockReturnValueOnce(false)

    render(<ErrorPage />)

    const link = screen.getByRole("link", { name: /Back to home/i })
    expect(link.classList.contains("text-background!")).toBe(true)
    expect(link.classList.contains("bg-foreground")).toBe(true)
  })

  it("mostra messaggio da Error standard", () => {
    useRouteErrorMock.mockReturnValueOnce(new Error("Custom error"))
    isRouteErrorResponseMock.mockReturnValueOnce(false)

    render(<ErrorPage />)
    expect(screen.getByText("Custom error")).toBeInTheDocument()
  })
})

