// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PasswordStrengthIndicator } from "@/components/ui/password-strength-indicator"

describe("PasswordStrengthIndicator", () => {
  it("renders invisible container when password is empty", () => {
    render(<PasswordStrengthIndicator password="" />)
    const indicator = screen.getByTestId("password-strength-indicator")
    expect(indicator).toHaveClass("invisible")
  })

  it("renders weak indicator for short simple password", () => {
    render(<PasswordStrengthIndicator password="123" />)
    const indicator = screen.getByTestId("password-strength-indicator")
    expect(indicator).not.toHaveClass("invisible")
    expect(screen.getByText(/weak|debole/i)).toBeInTheDocument()
  })

  it("renders strong indicator for robust password", () => {
    render(
      <PasswordStrengthIndicator
        password="K8#mQ9!vL2$pX5@zR"
        name="John"
        surname="Doe"
        email="john.doe@example.com"
      />
    )
    const indicator = screen.getByTestId("password-strength-indicator")
    expect(indicator).not.toHaveClass("invisible")
    expect(screen.getByText(/strong|forte/i)).toBeInTheDocument()
  })
})
