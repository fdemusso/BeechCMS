// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CANONICAL_ENTRIES, CANONICAL_SEEDS, CANONICAL_USERS } from "@beechcms/testing"
import { CommandPalette, type PaletteProvider } from "@/features/command-palette"

const { navigateMock, grantedPermissions, toastMock, searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  navigateMock: vi.fn(),
  // Entries are "<permission>@<scope>"; "*" is the global scope.
  grantedPermissions: new Set<string>(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("@/lib/rpc", () => ({ rpc: { api: { search: { $get: searchMock } } } }))
// The debounce only delays the request; the tests are about what is requested and shown.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }))

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
const HIT_ID = "0c1f6d36-9c8a-4a78-8c2e-3f2f4f6a1b11"
const HIT_UPDATED_AT = 1_700_000_000

// The HTTP response shape: this is the boundary being mocked.
function searchHit(overrides: Record<string, unknown> = {}) {
  return {
    id: HIT_ID,
    schema_slug: "posts",
    slug: "canonical-post",
    status: "published",
    updated_at: HIT_UPDATED_AT,
    author_name: CANONICAL_USERS.editor.name,
    title: String(CANONICAL_ENTRIES[0].data.title),
    excerpt: "",
    data: {},
    ...overrides,
  }
}

function searchResponse(...hits: ReturnType<typeof searchHit>[]) {
  return { json: async () => ({ items: hits, nextCursor: null, total: hits.length }) }
}

function renderPalette(hostProviders: readonly PaletteProvider[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette hostProviders={hostProviders} />
    </QueryClientProvider>,
  )
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantedPermissions.clear()
    searchMock.mockReset()
    searchMock.mockResolvedValue(searchResponse())
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
    renderPalette([])

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
    renderPalette([])

    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_CREATE)).toBeInTheDocument()
  })

  it("Escape on a sub-page returns to the root page and keeps the palette open", () => {
    renderPalette([])
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
    fireEvent.keyDown(document, { key: "˜", code: "KeyN", altKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
  })

  it("Escape on the root page closes the palette", () => {
    renderPalette([])
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("with no authority the palette lists no content rows and no New content row", () => {
    renderPalette([])

    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.queryByText(/^Go to /)).not.toBeInTheDocument()
    expect(screen.queryByText("New content…")).not.toBeInTheDocument()
  })

  it("a create row without content:create on its seed is disabled, names the permission and does not navigate on Enter", () => {
    grantedPermissions.add("content:read@posts")
    renderPalette([])
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
    renderPalette([hostProvider])
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
    renderPalette([hostProvider])

    typeInRoot("2025-5")

    const rows = screen.getAllByRole("option")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("2025-5 = 2020")
    expect(rows[1]).not.toHaveTextContent("= 2020")
  })

  it("pressing Enter on the calculator row copies the bare value, closes the dialog and confirms with a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderPalette([])
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(writeText).toHaveBeenCalledWith("2020")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Copied 2020"))
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("typing =16px shows no conversion row because the prefix routes to the calculator only", () => {
    renderPalette([])

    typeInRoot("=16px")

    expect(screen.queryByText(/16px = 1rem/)).not.toBeInTheDocument()
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })

  it("with no clipboard API Enter on a computed row closes the dialog and shows the error toast", () => {
    stubClipboard(undefined)
    renderPalette([])
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith("Copy failed")
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it("typing a term lists the matching local rows at once while the search request is pending", () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockReturnValue(new Promise(() => {}))
    renderPalette([])

    typeInRoot("post")

    expect(screen.getByText("Go to Post…")).toBeInTheDocument()
    expect(screen.queryByText("Canonical Post")).not.toBeInTheDocument()
  })

  it("typing a term appends the search rows after the local rows once the request resolves", async () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit()))
    renderPalette([])

    typeInRoot("post")

    expect(await screen.findByText("Canonical Post")).toBeInTheDocument()
    const rows = screen.getAllByRole("option")
    expect(rows[0]).toHaveTextContent("Go to Post…")
    expect(rows[rows.length - 1]).toHaveTextContent("Canonical Post")
  })

  it("typing 2025-5 with a content hit titled 2025-5 lists the calculator row first and the content row second", async () => {
    // The brief's coexistence example: computed rows and search rows share the list.
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit({ title: "2025-5" })))
    renderPalette([])

    typeInRoot("2025-5")

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2))
    const rows = screen.getAllByRole("option")
    expect(rows[0]).toHaveTextContent("2025-5 = 2020")
    expect(rows[1]).toHaveTextContent("2025-5")
    expect(rows[1]).not.toHaveTextContent("= 2020")
  })

  it("while the search is pending and no local row matches, the list shows Searching and not No results", () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockReturnValue(new Promise(() => {}))
    renderPalette([])

    typeInRoot("zzzz")

    expect(screen.getByText("Searching…")).toBeInTheDocument()
    expect(screen.queryByText(/^No results/)).not.toBeInTheDocument()
  })

  it("a failing search keeps the local rows and shows no toast", async () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockRejectedValue(new Error("network down"))
    renderPalette([])

    typeInRoot("post")

    await waitFor(() => expect(searchMock).toHaveBeenCalledOnce())
    expect(screen.getByText("Go to Post…")).toBeInTheDocument()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it("typing / followed by a term lists only search rows", async () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit()))
    renderPalette([])

    typeInRoot("/canonical")

    expect(await screen.findByText("Canonical Post")).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(1)
    expect(screen.queryByText("Go to Post…")).not.toBeInTheDocument()
  })

  it("a blank query sends no search request", () => {
    grantedPermissions.add("content:read@posts")
    renderPalette([])

    typeInRoot("   ")

    expect(searchMock).not.toHaveBeenCalled()
  })

  it("a search row shows the Published status badge and the author name on its second line", async () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit()))
    renderPalette([])

    typeInRoot("/canonical")

    const row = (await screen.findByText("Canonical Post")).closest("[data-slot='command-item']")
    expect(row).toHaveTextContent("Published")
    expect(row).toHaveTextContent(CANONICAL_USERS.editor.name)
  })

  it("selecting a search row navigates to the entry and closes the dialog", async () => {
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit()))
    renderPalette([])
    typeInRoot("/canonical")

    fireEvent.click(await screen.findByText("Canonical Post"))

    expect(navigateMock).toHaveBeenCalledWith(`/content/posts/${HIT_ID}`)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  async function selectHit() {
    grantedPermissions.add("content:read@posts")
    searchMock.mockResolvedValue(searchResponse(searchHit()))
    const input = typeInRoot("/canonical")
    await screen.findByText("Canonical Post")
    return input
  }

  async function openActionsOnHit() {
    const input = await selectHit()
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })
    await screen.findByText("Copy ID")
    return input
  }

  it("Ctrl+Enter on a search row copies the hit id, closes the dialog and does not navigate", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderPalette([])
    const input = await selectHit()

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ctrlKey: true })

    expect(writeText).toHaveBeenCalledWith(HIT_ID)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(`Copied ${HIT_ID}`))
  })

  it("Ctrl+Enter on the calculator row neither copies nor closes the dialog", () => {
    // Regression guard: cmdk's Enter ignores modifiers, so a chord the engine does not consume would run the primary copy.
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderPalette([])
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ctrlKey: true })

    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("Shift+Enter on a search row opens the actions page listing Copy ID under the hit's title", async () => {
    renderPalette([])
    const input = await selectHit()

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })

    expect(await screen.findByPlaceholderText("Choose an action…")).toBeInTheDocument()
    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent("Copy ID")
    expect(screen.getByText("Canonical Post")).toBeInTheDocument()
  })

  it("Shift+Enter on a row without actions keeps the root page", () => {
    renderPalette([])
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })

    expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
  })

  it("Enter on the actions page copies the frozen target's id and closes the dialog", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderPalette([])
    const input = await openActionsOnHit()

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(writeText).toHaveBeenCalledWith(HIT_ID)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("Escape on the actions page returns to the root page with the typed query restored", async () => {
    renderPalette([])
    await openActionsOnHit()

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

    expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toHaveValue("/canonical")
    expect(await screen.findByText("Canonical Post")).toBeInTheDocument()
  })

  it("with a search row selected the footer shows the Copy ID and Actions hints", async () => {
    renderPalette([])

    await selectHit()

    const footer = (await screen.findByText("Actions")).closest("div") as HTMLElement
    expect(within(footer).getByText("Copy ID")).toBeInTheDocument()
    expect(within(footer).getAllByText("↵")).toHaveLength(2)
    expect(within(footer).getByText("⇧")).toBeInTheDocument()
  })

  it("with the calculator row selected the footer shows neither hint", () => {
    renderPalette([])

    typeInRoot("2025-5")

    expect(screen.queryByText("Actions")).not.toBeInTheDocument()
    expect(screen.queryByText("Copy ID")).not.toBeInTheDocument()
  })

  it("the idle root lists no Search content row", () => {
    // Regression guard: the sub-page entry point is gone.
    grantedPermissions.add("content:read@posts")
    renderPalette([])

    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    expect(screen.queryByText("Search content…")).not.toBeInTheDocument()
  })
})
