// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, screen, waitFor, within, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CANONICAL_ENTRIES, CANONICAL_SEEDS, CANONICAL_USERS } from "@beechcms/testing"
import { CommandPalette, type PaletteProvider } from "@/features/command-palette"
import {
  useDeclarePageActions,
  type PageAction,
  type PageActionDeclaration,
} from "@/features/shared/hooks/use-page-actions"
import { insertNote, QUICK_NOTES_MAX_COUNT, readNotes, type QuickNote } from "../../lib/quick-notes-storage"
import { readRecentIds, recordRecentId } from "../../lib/recent-items-storage"

const { navigateMock, grantedPermissions, toastMock, searchMock, uiPreferencesGetMock, uiPreferencesPutMock, setThemeMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  setThemeMock: vi.fn(),
  uiPreferencesGetMock: vi.fn(),
  uiPreferencesPutMock: vi.fn(),
  navigateMock: vi.fn(),
  // Entries are "<permission>@<scope>"; "*" is the global scope.
  grantedPermissions: new Set<string>(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      search: { $get: searchMock },
      settings: { "ui-preferences": { $get: uiPreferencesGetMock, $put: uiPreferencesPutMock } },
    },
  },
}))
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
  useMe: () => ({ data: { id: CANONICAL_USERS.editor.id } }),
}))

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    setTheme: setThemeMock,
  }),
}))

const PLACEHOLDER_ROOT = "Search actions, content, seeds…"
const PLACEHOLDER_CREATE = "Create content in which seed?"
const HIT_ID = "0c1f6d36-9c8a-4a78-8c2e-3f2f4f6a1b11"
const HIT_UPDATED_AT = 1_700_000_000
const EDITOR_ID = CANONICAL_USERS.editor.id
const ADMIN_ID = CANONICAL_USERS.admin.id

const ALPHA_NOTE: QuickNote = { id: "5b0e2c1a-3d4f-4a6b-8c7d-9e0f1a2b3c4d", text: "alpha", createdAt: 1_700_000_000_000 }
const BRAVO_NOTE: QuickNote = { id: "7d2a4e3c-5f6b-4c8d-8e9f-1a2b3c4d5e6f", text: "bravo", createdAt: 1_700_000_100_000 }

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

function renderPalette(hostProviders: readonly PaletteProvider[], onOpenChange?: (open: boolean) => void, onNewSeed?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette hostProviders={hostProviders} onOpenChange={onOpenChange} onNewSeed={onNewSeed} />
    </QueryClientProvider>,
  )
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantedPermissions.clear()
    searchMock.mockReset()
    searchMock.mockResolvedValue(searchResponse())
    setThemeMock.mockClear()
    uiPreferencesGetMock.mockReset()
    uiPreferencesGetMock.mockResolvedValue({ json: async () => ({ palettePins: [] }) })
    uiPreferencesPutMock.mockReset()
    uiPreferencesPutMock.mockImplementation(async ({ json }: { json: { palettePins: string[] } }) => ({
      json: async () => json,
    }))
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

  it("Alt+Shift+N does not open the create page: it belongs to the host's new content type shortcut", () => {
    renderPalette([])

    fireEvent.keyDown(document, { key: "N", code: "KeyN", altKey: true, shiftKey: true })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("Alt+Shift+N closes an open palette and runs onNewSeed", () => {
    const onNewSeed = vi.fn()
    renderPalette([], undefined, onNewSeed)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })

    fireEvent.keyDown(document, { key: "N", code: "KeyN", altKey: true, shiftKey: true })

    expect(onNewSeed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("Alt+Shift+N does nothing without onNewSeed", () => {
    renderPalette([])

    fireEvent.keyDown(document, { key: "N", code: "KeyN", altKey: true, shiftKey: true })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("Cmd+Shift+L switches the theme and Ctrl+Shift+L does the same", () => {
    renderPalette([])

    fireEvent.keyDown(document, { key: "L", code: "KeyL", metaKey: true, shiftKey: true })
    fireEvent.keyDown(document, { key: "L", code: "KeyL", ctrlKey: true, shiftKey: true })

    expect(setThemeMock.mock.calls).toEqual([["light"], ["light"]])
  })

  it.each([
    ["without Shift", { key: "l", code: "KeyL", metaKey: true }],
    ["without Cmd or Ctrl", { key: "L", code: "KeyL", shiftKey: true }],
    ["with Alt", { key: "L", code: "KeyL", metaKey: true, shiftKey: true, altKey: true }],
  ])("the theme shortcut is not triggered %s", (_name, keys) => {
    renderPalette([])

    fireEvent.keyDown(document, keys)

    expect(setThemeMock).not.toHaveBeenCalled()
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

  it("with no clipboard API and a refusing fallback Enter on a computed row closes the dialog and shows the error toast", async () => {
    stubClipboard(undefined)
    // The selection fallback is the last resort: here it refuses too.
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true })
    renderPalette([])
    const input = typeInRoot("2025-5")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Copy failed"))
    expect(toastMock.success).not.toHaveBeenCalled()
    Reflect.deleteProperty(document, "execCommand")
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

  it("# buy milk plus Enter saves the note for the current user, closes the dialog and toasts the browser-only message", () => {
    renderPalette([])
    const input = typeInRoot("# buy milk")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(toastMock.success).toHaveBeenCalledWith("Note saved on this browser only")
    expect(readNotes(localStorage, EDITOR_ID).map((note) => note.text)).toEqual(["buy milk"])
  })

  it("#f00 lists the colour conversion row and no Quick notes row", () => {
    // Regression guard: routing a hex colour to the notes prefix would drop the conversion row.
    renderPalette([])

    typeInRoot("#f00")

    expect(screen.getByText(/^#f00 = /)).toBeInTheDocument()
    expect(screen.queryByText("Quick notes")).not.toBeInTheDocument()
  })

  it("notes stored for another user are not listed", () => {
    insertNote(localStorage, ADMIN_ID, ALPHA_NOTE)
    renderPalette([])

    typeInRoot("#")

    expect(screen.queryByText(ALPHA_NOTE.text)).not.toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(1)
    expect(screen.getByText("New note")).toBeInTheDocument()
  })

  it("Enter on a note row copies its text and confirms with a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    insertNote(localStorage, EDITOR_ID, ALPHA_NOTE)
    renderPalette([])
    const input = typeInRoot("#")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(writeText).toHaveBeenCalledExactlyOnceWith(ALPHA_NOTE.text)
    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(`Copied ${ALPHA_NOTE.text}`))
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("copying a long note confirms with a short preview, not the whole text", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    const longNote: QuickNote = { ...ALPHA_NOTE, text: "word ".repeat(30).trim() }
    insertNote(localStorage, EDITOR_ID, longNote)
    renderPalette([])
    const input = typeInRoot("#")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    await vi.waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    const [message] = toastMock.success.mock.calls[0] as [string]
    // "Copied " plus a 40 character preview.
    expect(message.length).toBeLessThanOrEqual(47)
    expect(message.startsWith("Copied word word")).toBe(true)
  })

  it("right-clicking a note offers Delete note and picking it removes that note", async () => {
    insertNote(localStorage, EDITOR_ID, ALPHA_NOTE)
    insertNote(localStorage, EDITOR_ID, BRAVO_NOTE)
    renderPalette([])
    typeInRoot("#")

    fireEvent.contextMenu(screen.getByText(ALPHA_NOTE.text))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete note" }))

    expect(readNotes(localStorage, EDITOR_ID)).toEqual([BRAVO_NOTE])
  })

  it("the Delete note entry of the right-click menu has the destructive style", async () => {
    insertNote(localStorage, EDITOR_ID, ALPHA_NOTE)
    renderPalette([])
    typeInRoot("#")

    fireEvent.contextMenu(screen.getByText(ALPHA_NOTE.text))

    const deleteEntry = await screen.findByRole("menuitem", { name: "Delete note" })
    expect(deleteEntry).toHaveAttribute("data-variant", "destructive")
  })

  it("clicking a note row copies its text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    insertNote(localStorage, EDITOR_ID, ALPHA_NOTE)
    renderPalette([])
    typeInRoot("#")

    fireEvent.click(screen.getByText(ALPHA_NOTE.text))

    expect(writeText).toHaveBeenCalledExactlyOnceWith(ALPHA_NOTE.text)
  })

  it("Ctrl+Enter on a note row deletes that note from storage and keeps the others", () => {
    insertNote(localStorage, EDITOR_ID, ALPHA_NOTE)
    insertNote(localStorage, EDITOR_ID, BRAVO_NOTE)
    renderPalette([])
    // The empty compose row is disabled, so the newest note is the selected row.
    const input = typeInRoot("#")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ctrlKey: true })

    expect(readNotes(localStorage, EDITOR_ID)).toEqual([ALPHA_NOTE])
    expect(toastMock.success).toHaveBeenCalledWith("Note deleted", expect.any(Object))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("with a full list the compose row is disabled with the cap message and Enter saves nothing", () => {
    for (let index = 0; index < QUICK_NOTES_MAX_COUNT; index++) {
      insertNote(localStorage, EDITOR_ID, {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        text: `note ${index}`,
        createdAt: 1_700_000_000_000 + index,
      })
    }
    renderPalette([])
    const input = typeInRoot("# one more")

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    const composeRow = screen.getByText("Save note: one more").closest("[data-slot='command-item']")
    expect(composeRow).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(`${QUICK_NOTES_MAX_COUNT} notes saved: delete one to save a new one`)).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(readNotes(localStorage, EDITOR_ID)).toHaveLength(QUICK_NOTES_MAX_COUNT)
  })

  describe("page actions", () => {
    const PAGE_ENTRY_ID = "550e8400-e29b-41d4-a716-446655440000"
    const OTHER_ENTRY_ID = "8f14e45f-ceea-4672-9a4b-1c5e0a2b3d4f"
    const CONFIRM = { title: "Publish this draft?", description: "It replaces the live version." }

    function pageAction(overrides: Partial<PageAction> = {}): PageAction {
      return { id: "save", label: "Save entry", icon: () => null, perform: { kind: "run", run: vi.fn() }, ...overrides }
    }

    function pageDeclaration(action: PageAction, targetId = PAGE_ENTRY_ID): PageActionDeclaration {
      return { hostId: "entry-editor", targetId, title: "Edit Post", actions: [action] }
    }

    // A page that declares actions renders nothing itself, like the entry editor's hook.
    function Host({ declaration }: { declaration: PageActionDeclaration | null }) {
      useDeclarePageActions(declaration)
      return null
    }

    function renderPaletteWithPage(declaration: PageActionDeclaration) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const tree = (current: PageActionDeclaration) => (
        <QueryClientProvider client={client}>
          <Host declaration={current} />
          <CommandPalette hostProviders={[]} />
        </QueryClientProvider>
      )
      const view = render(tree(declaration))
      return { updatePage: (next: PageActionDeclaration) => view.rerender(tree(next)) }
    }

    function openPalette() {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
      return screen.getByPlaceholderText(PLACEHOLDER_ROOT)
    }

    function confirmableAction(run = vi.fn()): PageAction {
      return pageAction({ id: "publish-draft", label: "Publish draft", confirm: CONFIRM, perform: { kind: "run", run } })
    }

    it("with a page declaration the idle root lists its section before the navigation rows", () => {
      renderPaletteWithPage(pageDeclaration(pageAction()))

      openPalette()

      const rows = screen.getAllByRole("option")
      expect(rows[0]).toHaveTextContent("Save entry")
      expect(screen.getByText("Edit Post")).toBeInTheDocument()
      expect(rows.some((row) => row.textContent?.includes("Dashboard"))).toBe(true)
    })

    it("Enter on an action without confirm runs it once and closes the dialog", () => {
      const run = vi.fn()
      renderPaletteWithPage(pageDeclaration(pageAction({ perform: { kind: "run", run } })))
      const input = openPalette()

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      expect(run).toHaveBeenCalledOnce()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("Enter on an action with confirm closes the palette, opens the confirmation and runs nothing", () => {
      const run = vi.fn()
      renderPaletteWithPage(pageDeclaration(confirmableAction(run)))
      const input = openPalette()

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(screen.getByRole("alertdialog")).toHaveTextContent(CONFIRM.title)
      expect(run).not.toHaveBeenCalled()
    })

    it("confirming runs the frozen action once and leaves the palette closed", async () => {
      const run = vi.fn()
      renderPaletteWithPage(pageDeclaration(confirmableAction(run)))
      fireEvent.keyDown(openPalette(), { key: "Enter", code: "Enter" })

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
      expect(run).toHaveBeenCalledOnce()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("cancelling the confirmation runs nothing and reopens the palette on root", async () => {
      const run = vi.fn()
      renderPaletteWithPage(pageDeclaration(confirmableAction(run)))
      fireEvent.keyDown(openPalette(), { key: "Enter", code: "Enter" })

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

      expect(await screen.findByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
      expect(run).not.toHaveBeenCalled()
    })

    it("confirming after the host changed its target runs nothing and toasts an error", async () => {
      // Regression guard: the same editor instance can switch records while the confirmation is open.
      const run = vi.fn()
      const action = confirmableAction(run)
      const { updatePage } = renderPaletteWithPage(pageDeclaration(action))
      fireEvent.keyDown(openPalette(), { key: "Enter", code: "Enter" })
      updatePage(pageDeclaration(action, OTHER_ENTRY_ID))

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
      expect(run).not.toHaveBeenCalled()
      expect(toastMock.error).toHaveBeenCalledWith("The page changed before you confirmed: nothing was done")
    })

    it("an action whose requirement fails is disabled with the missing permission and Enter runs nothing", () => {
      const run = vi.fn()
      renderPaletteWithPage(
        pageDeclaration(pageAction({ requires: { permission: "content:update", scope: "posts" }, perform: { kind: "run", run } })),
      )
      // Typing leaves the disabled row alone in the list; otherwise Enter would pick the next enabled row.
      const input = typeInRoot("Save entry")

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      const row = screen.getByText("Save entry").closest("[data-slot='command-item']")
      expect(row).toHaveAttribute("aria-disabled", "true")
      expect(screen.getByText("Requires the content:update permission")).toBeInTheDocument()
      expect(run).not.toHaveBeenCalled()
    })

    it("with the = prefix no page action is listed", () => {
      renderPaletteWithPage(pageDeclaration(pageAction()))

      typeInRoot("=1+1")

      expect(screen.queryByText("Save entry")).not.toBeInTheDocument()
    })
  })

  describe("system commands and shortcuts", () => {
    it("tells onOpenChange true when the palette opens and false when it closes", () => {
      const onOpenChange = vi.fn()
      renderPalette([], onOpenChange)

      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" })

      // Reported on change only: the palette starts closed and the host assumes that.
      expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    })

    it("Enter on the keyboard shortcuts row opens the shortcuts page with the prefix rows", () => {
      renderPalette([])
      const input = typeInRoot("Keyboard shortcuts")

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      expect(screen.getByPlaceholderText("Filter shortcuts…")).toBeInTheDocument()
      expect(screen.getByText("Prefixes")).toBeInTheDocument()
      expect(screen.getByText("System commands and preferences")).toBeInTheDocument()
      expect(screen.getByText("Search content only")).toBeInTheDocument()
    })

    it("Enter on a shortcut row closes the palette", () => {
      renderPalette([])
      fireEvent.keyDown(typeInRoot("Keyboard shortcuts"), { key: "Enter", code: "Enter" })

      fireEvent.keyDown(screen.getByPlaceholderText("Filter shortcuts…"), { key: "Enter", code: "Enter" })

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("with the > prefix the tools rows are listed and the navigation rows are not", () => {
      renderPalette([])

      typeInRoot(">")

      expect(screen.getByText("Change theme")).toBeInTheDocument()
      expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument()
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument()
    })
  })

  describe("recent items", () => {
    function openPalette() {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
      return screen.getByPlaceholderText(PLACEHOLDER_ROOT)
    }

    function recentRows() {
      const recentHeading = screen.getByText("Recent")
      const group = recentHeading.closest("[cmdk-group]")
      if (!group) throw new Error("Recent heading is not inside a group")
      return within(group as HTMLElement).getAllByRole("option")
    }

    it("the idle root shows no Recent section before anything was performed", () => {
      renderPalette([])

      openPalette()

      expect(screen.getByText("Dashboard")).toBeInTheDocument()
      expect(screen.queryByText("Recent")).not.toBeInTheDocument()
    })

    it("Enter on a navigation row, then reopening, lists that row first under Recent", () => {
      renderPalette([])
      fireEvent.keyDown(openPalette(), { key: "Enter", code: "Enter" })

      openPalette()

      const rows = screen.getAllByRole("option")
      expect(rows[0]).toHaveTextContent("Dashboard")
      expect(recentRows()).toHaveLength(1)
      expect(recentRows()[0]).toHaveTextContent("Navigate")
      expect(readRecentIds(localStorage, EDITOR_ID)).toEqual(["nav:/"])
    })

    it("Enter on a recent row navigates to its destination and keeps a single recent entry for it", () => {
      renderPalette([])
      fireEvent.keyDown(openPalette(), { key: "Enter", code: "Enter" })
      const input = openPalette()
      navigateMock.mockClear()

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      expect(navigateMock).toHaveBeenCalledExactlyOnceWith("/")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(readRecentIds(localStorage, EDITOR_ID)).toEqual(["nav:/"])
    })

    it("typing hides the Recent section", () => {
      recordRecentId(localStorage, EDITOR_ID, "nav:/")
      renderPalette([])

      typeInRoot("dash")

      expect(screen.getByText("Dashboard")).toBeInTheDocument()
      expect(screen.queryByText("Recent")).not.toBeInTheDocument()
    })

    it("a recorded create row is listed disabled with the missing permission once content:create on its seed is revoked", () => {
      recordRecentId(localStorage, EDITOR_ID, "content:create:posts")
      grantedPermissions.add("content:read@posts")
      renderPalette([])

      openPalette()

      const row = screen.getByText("Create in Post").closest("[data-slot='command-item']")
      expect(row).toHaveAttribute("aria-disabled", "true")
      expect(row).toHaveTextContent("Requires the content:create permission")
      expect(recentRows()).toContain(row)
    })

    it("Enter on a search row records nothing", async () => {
      // Regression guard: search hits are never recents (roadmap 7b).
      grantedPermissions.add("content:read@posts")
      searchMock.mockResolvedValue(searchResponse(searchHit()))
      renderPalette([])
      const input = typeInRoot("/canonical")
      await screen.findByText("Canonical Post")

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      expect(navigateMock).toHaveBeenCalledWith(`/content/posts/${HIT_ID}`)
      expect(readRecentIds(localStorage, EDITOR_ID)).toEqual([])
    })
  })

  describe("pins", () => {
    const CTRL_ENTER = { key: "Enter", code: "Enter", ctrlKey: true }

    function openPalette() {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
      return screen.getByPlaceholderText(PLACEHOLDER_ROOT)
    }

    // The pins are in cache before the first open, as in the app; the flush lets the mocked GET settle.
    async function settlePins(stored: string[]) {
      uiPreferencesGetMock.mockResolvedValue({ json: async () => ({ palettePins: stored }) })
      renderPalette([])
      await waitFor(() => expect(uiPreferencesGetMock).toHaveBeenCalled())
      await act(async () => {})
    }

    function groupRows(heading: string) {
      const group = screen.getByText(heading).closest("[cmdk-group]")
      if (!group) throw new Error(`${heading} heading is not inside a group`)
      return within(group as HTMLElement).getAllByRole("option")
    }

    function Host({ declaration }: { declaration: PageActionDeclaration }) {
      useDeclarePageActions(declaration)
      return null
    }

    it("the idle root shows no Pinned section when nothing is pinned", async () => {
      await settlePins([])

      openPalette()

      expect(screen.getByText("Dashboard")).toBeInTheDocument()
      expect(screen.queryByText("Pinned")).not.toBeInTheDocument()
    })

    it("stored pins are listed first under Pinned, after the page actions and before Recent", async () => {
      uiPreferencesGetMock.mockResolvedValue({ json: async () => ({ palettePins: ["tools:theme"] }) })
      recordRecentId(localStorage, EDITOR_ID, "nav:/")
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const declaration: PageActionDeclaration = {
        hostId: "entry-editor",
        targetId: HIT_ID,
        title: "Edit Post",
        actions: [{ id: "save", label: "Save entry", icon: () => null, perform: { kind: "run", run: vi.fn() } }],
      }
      render(
        <QueryClientProvider client={client}>
          <Host declaration={declaration} />
          <CommandPalette hostProviders={[]} />
        </QueryClientProvider>,
      )
      await waitFor(() => expect(uiPreferencesGetMock).toHaveBeenCalled())
      await act(async () => {})

      openPalette()

      const [first, second, third] = screen.getAllByRole("option")
      expect(first).toHaveTextContent("Save entry")
      expect(second).toHaveTextContent("Change theme")
      expect(third).toHaveTextContent("Dashboard")
      expect(groupRows("Pinned")).toHaveLength(1)
      expect(groupRows("Recent")).toHaveLength(1)
    })

    it("Mod+Enter on a navigation row PUTs it as a pin and keeps the palette open, listing it under Pinned", async () => {
      await settlePins([])
      const input = openPalette()

      fireEvent.keyDown(input, CTRL_ENTER)

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Pinned: Dashboard"))
      expect(uiPreferencesPutMock).toHaveBeenCalledExactlyOnceWith({ json: { palettePins: ["nav:/"] } })
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      await waitFor(() => expect(groupRows("Pinned")[0]).toHaveTextContent("Dashboard"))
    })

    it("picking Pin to the top on the actions page returns to the list and keeps the palette open", async () => {
      await settlePins([])
      const input = openPalette()
      fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })
      const pinAction = await screen.findByText("Pin to the top")

      fireEvent.click(pinAction)

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Pinned: Dashboard"))
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getByPlaceholderText(PLACEHOLDER_ROOT)).toBeInTheDocument()
    })

    it("right-clicking a stable row offers Pin to the top, and picking it pins the row and keeps the palette open", async () => {
      await settlePins([])
      openPalette()

      fireEvent.contextMenu(screen.getByText("Dashboard"))
      fireEvent.click(await screen.findByRole("menuitem", { name: "Pin to the top" }))

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Pinned: Dashboard"))
      expect(uiPreferencesPutMock).toHaveBeenCalledExactlyOnceWith({ json: { palettePins: ["nav:/"] } })
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("right-clicking a pinned row offers Unpin instead of Pin", async () => {
      await settlePins(["nav:/"])
      openPalette()

      fireEvent.contextMenu(groupRows("Pinned")[0])

      expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeInTheDocument()
      expect(screen.queryByRole("menuitem", { name: "Pin to the top" })).not.toBeInTheDocument()
    })

    it("Shift+Enter on a stable row lists Pin to the top on the actions page", async () => {
      await settlePins([])
      const input = openPalette()

      fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })

      expect(await screen.findByPlaceholderText("Choose an action…")).toBeInTheDocument()
      expect(screen.getByText("Pin to the top")).toBeInTheDocument()
    })

    it("Mod+Enter on a pinned row unpins it", async () => {
      await settlePins(["nav:/"])
      const input = openPalette()

      fireEvent.keyDown(input, CTRL_ENTER)

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Unpinned: Dashboard"))
      expect(uiPreferencesPutMock).toHaveBeenCalledExactlyOnceWith({ json: { palettePins: [] } })
    })

    it("a pinned create row is listed disabled with the missing permission once content:create on its seed is revoked", async () => {
      grantedPermissions.add("content:read@posts")
      await settlePins(["content:create:posts"])

      openPalette()

      const pinnedRow = groupRows("Pinned")[0]
      expect(pinnedRow).toHaveTextContent("Create in Post")
      expect(pinnedRow).toHaveAttribute("aria-disabled", "true")
      expect(pinnedRow).toHaveTextContent("Requires the content:create permission")
    })

    it("a pin whose seed no longer exists is listed as unavailable, and Enter on it PUTs the list without it", async () => {
      await settlePins(["content:open:deleted-seed"])
      const input = openPalette()
      expect(groupRows("Pinned")[0]).toHaveTextContent("Unavailable item")

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

      await waitFor(() =>
        expect(uiPreferencesPutMock).toHaveBeenCalledExactlyOnceWith({ json: { palettePins: [] } }),
      )
    })

    it("a pinned row is not listed again under Recent", async () => {
      recordRecentId(localStorage, EDITOR_ID, "nav:/")
      await settlePins(["nav:/"])

      openPalette()

      expect(groupRows("Pinned")).toHaveLength(1)
      expect(screen.queryByText("Recent")).not.toBeInTheDocument()
    })

    it("a rejected PUT toasts the error and the open palette shows the pins as before", async () => {
      // Regression guard: the list must never look saved when the server refused it.
      uiPreferencesPutMock.mockRejectedValue(new Error("network"))
      await settlePins([])
      const input = openPalette()

      fireEvent.keyDown(input, CTRL_ENTER)

      await waitFor(() =>
        expect(toastMock.error).toHaveBeenCalledWith("Pins not saved: try again. Your list is unchanged"),
      )
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.queryByText("Pinned")).not.toBeInTheDocument()
    })

    it("a search row offers no pin action", async () => {
      // Regression guard: search hits are never pins.
      grantedPermissions.add("content:read@posts")
      searchMock.mockResolvedValue(searchResponse(searchHit()))
      await settlePins([])
      const input = typeInRoot("/canonical")
      await screen.findByText("Canonical Post")

      fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true })

      expect(await screen.findByText("Copy ID")).toBeInTheDocument()
      expect(screen.queryByText("Pin to the top")).not.toBeInTheDocument()
    })
  })
})
