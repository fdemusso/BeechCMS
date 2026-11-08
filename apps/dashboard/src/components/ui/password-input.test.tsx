// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { PasswordInput } from "./password-input"

describe("PasswordInput", () => {
  it("hides what is typed until the eye is pressed, and hides it again on the next press", () => {
    render(<PasswordInput aria-label="Secret" defaultValue="hunter2" />)
    const input = screen.getByLabelText("Secret")
    expect(input).toHaveAttribute("type", "password")

    fireEvent.click(screen.getByRole("button", { name: "Show password" }))
    expect(input).toHaveAttribute("type", "text")

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }))
    expect(input).toHaveAttribute("type", "password")
  })

  it("passes the usual input props through", () => {
    render(<PasswordInput aria-label="Secret" autoComplete="new-password" />)
    expect(screen.getByLabelText("Secret")).toHaveAttribute("autocomplete", "new-password")
  })
})
