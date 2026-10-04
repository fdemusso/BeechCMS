// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ViewEmptyState } from "../../components/view-empty-state"

describe("ViewEmptyState", () => {
  it("names the View Type and creates a view when the user clicks the create button", () => {
    const onCreate = vi.fn()
    render(<ViewEmptyState typeLabel="Gallery" onCreate={onCreate} />)

    expect(screen.getByText("No Gallery views yet")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button"))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it("renders no create button when the caller passes no onCreate", () => {
    render(<ViewEmptyState typeLabel="Gallery" />)

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
