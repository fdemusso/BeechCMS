// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const navigate = vi.fn()

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}))

import { QuickActionsAdapter } from "@/features/dashboard/registry/builtin/quick-actions-adapter"

describe("QuickActionsAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("navigates to /settings when the media action is clicked", () => {
    render(<QuickActionsAdapter />)

    fireEvent.click(screen.getByText("Carica Media"))

    expect(navigate).toHaveBeenCalledWith("/settings")
  })

  it("navigates to /settings when the collections action is clicked", () => {
    render(<QuickActionsAdapter />)

    fireEvent.click(screen.getByText("Gestisci Collezioni"))

    expect(navigate).toHaveBeenCalledWith("/settings")
  })
})
