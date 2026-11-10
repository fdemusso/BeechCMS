// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { CommandPalette, type PaletteProvider } from "@/features/command-palette"

const { navigateMock, grantedPermissions, toastMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  // Entries are "<permission>@<scope>"; "*" is the global scope.
  grantedPermissions: new Set<string>(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock("@/features/shared", () => ({
  usePermissions: () => ({
    can: (permission: string, scope: string) => grantedPermissions.has(`${permission}@${scope}`),
    canGlobally: (permission: string) => grantedPermissions.has(`${permission}@*`),
    canAnywhere: (permission: string) =>
      [...grantedPermissions].some((entry) => entry.startsWith(`${permission}@`)),
  }),
  useSchema: () => ({ data: CANONICAL_SEEDS }),
}))

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}))

const PLACEHOLDER_ROOT = "Search actions, content, seeds…"
const PLACEHOLDER_CREATE = "Create content in which seed?"

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantedPermissions.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard")
  })

  function stubClipboard(writeText: ((value: string) => Promise<void>) | undefined) {
    Object.defineProperty(navigator, "clipboard", {
      value: writeText ? { writeText } : undefined,
      configurable: true,
    })
  }

  function typeInRoot(value: string) {
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
    const input = screen.getByPlaceholderText(PLACEHOLDER_ROOT)
    fireEvent.change(input, { target: { value } })
    return input
  }

  it("opens when cmd+k is pressed and renders without crash", () => {
    render(<CommandPalette hostProviders={[]} />)

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
    render(<CommandPalette hostProviders={[]} />)

    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_CREATE)).toBeInTheDocument()
  })

  it("Escape on a sub-page returns to the root page and keeps the palette open", () => {
    render(<CommandPalette hostProviders={[]} />)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
  })

  it("Escape on the root page closes the palette", () => {
    render(<CommandPalette hostProviders={[]} />)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("with no authority the palette lists no content rows and no New content row", () => {
    render(<CommandPalette hostProviders={[]} />)

    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.queryByText(/^Go to /)).not.toBeInTheDocument()
    expect(screen.queryByText("New content…")).not.toBeInTheDocument()
  })

  it("a create row without content:create on its seed is disabled, names the permission and does not navigate on Enter", () => {
    grantedPermissions.add("content:read@posts")
    render(<CommandPalette hostProviders={[]} />)
    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER_CREATE), { key: "Enter", code: "Enter" })

    const postsRow = screen.getByText("Post").closest("[data-slot='command-item']")
    expect(postsRow).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Requires the content:create permission")).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("selecting a host provider row runs it and closes the dialog", () => {
    const run = vi.fn()
    const hostProvider: PaletteProvider = {
      id: "host",
      pages: ["root"],
      getItems: () => [
        {
          id: "host:action",
          section: "Host",
          label: "Host action",
          icon: () => null,
          perform: { kind: "run", run },
        },
      ],
    }
    render(<CommandPalette hostProviders={[hostProvider]} />)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    fireEvent.click(screen.getByText("Host action"))

    expect(run).toHaveBeenCalledOnce()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("typing 2025-5 lists the calculator row first and a matching host row second", () => {
    const hostProvider: PaletteProvider = {
      id: "host",
      pages: ["root"],
      getItems: () => [
        { id: "host:year", section: "Host", label: "2025-5", icon: () => null, perform: { kind: "run", run: vi.fn() } },
      ],
    }
    render(<CommandPalette hostProviders={[hostProvider]} />)

    typeInRoot("2025-5")

    const rows = screen.getAllByRole("option")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("2025-5 = 2020")
    expect(rows[1]).not.toHaveTextContent("= 2020")
  })

  it("pressing Enter on the calculator row copies the bare value, closes the dialog and confirms with a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CommandPalette hostProviders={[]} />)
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(writeText).toHaveBeenCalledWith("2020")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Copied 2020"))
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("typing =16px shows no conversion row because the prefix routes to the calculator only", () => {
    render(<CommandPalette hostProviders={[]} />)

    typeInRoot("=16px")

    expect(screen.queryByText(/16px = 1rem/)).not.toBeInTheDocument()
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })

  it("with no clipboard API Enter on a computed row closes the dialog and shows the error toast", () => {
    stubClipboard(undefined)
    render(<CommandPalette hostProviders={[]} />)
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith("Copy failed")
    expect(toastMock.success).not.toHaveBeenCalled()
  })
})
