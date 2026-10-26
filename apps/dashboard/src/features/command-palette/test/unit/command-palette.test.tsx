// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { CommandPalette } from "@/features/command-palette"

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}))

const PLACEHOLDER_ROOT = "Search actions, content, seeds…"
const PLACEHOLDER_CREATE = "Create content in which seed?"

describe("CommandPalette", () => {
  it("opens when cmd+k is pressed and renders without crash", () => {
    render(<CommandPalette />)
    
    // Command palette is dialog, dialog is closed by default.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    // Trigger cmd+k keydown event on document
    fireEvent.keyDown(document, { key: "k", metaKey: true })

    // Now it should be open
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    
    // Check if the input placeholder is rendered correctly
    expect(screen.getByPlaceholderText("Search actions, content, seeds…")).toBeInTheDocument()
  })

  it("Option+N on macOS (key \"˜\", code KeyN) opens the palette on the create page", () => {
    render(<CommandPalette />)

    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_CREATE)).toBeInTheDocument()
  })

  it("Escape on a sub-page returns to the root page and keeps the palette open", () => {
    render(<CommandPalette />)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
  })

  it("Escape on the root page closes the palette", () => {
    render(<CommandPalette />)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
