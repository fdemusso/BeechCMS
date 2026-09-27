// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Cross-slice: entry-editor + content-management + shared. The real `useSchema` / `useLocaleConfig` /
 * `useContentEntry` / `useSaveContent` chain runs, and only the HTTP client and chrome are mocked, to
 * prove the Entry Editor's per-locale projection, touched-locale patch and auto-slug end to end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent, type RenderResult } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import type { LocaleSettings, Seed } from "@beechcms/core"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useBlocker: () => ({ state: "unblocked", reset: vi.fn(), proceed: vi.fn() }),
}))
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1", role: "editor" }, status: "authenticated" }) }))
vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))
vi.mock("@/features/backrefs", () => ({ ReferencedByPanel: () => null }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
// Radix Select needs pointer capture jsdom lacks: a context-driven stub keeps onValueChange real.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react")
  const SelectContext = React.createContext<(value: string) => void>(() => {})
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <div role="listbox">{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext)
      return <button type="button" role="option" aria-selected={false} onClick={() => onValueChange(value)}>{children}</button>
    },
  }
})

import { api } from "@/lib/api"
import { EntryEditorDialog } from "@/features/entry-editor"

const ENTRY_ID = "3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c"
const SEED: Seed = {
  slug: "loc_posts", label: "Post", displayNameAlias: "title",
  branches: [
    { id: "br_01", alias: "title", label: "Title", type: "text", localized: true, requiredOnCreate: true },
    { id: "br_02", alias: "summary", label: "Summary", type: "text", localized: true },
    { id: "br_03", alias: "sku", label: "SKU", type: "text" },
  ],
}
const BILINGUAL: LocaleSettings = { locales: ["it", "en"], defaultLocale: "it", defaultLanguage: "it" }
const ENTRY = {
  id: ENTRY_ID, schema_slug: "loc_posts", slug: "scarpa", status: "published", has_pending_draft: false,
  data: { title: { it: "Scarpa" }, summary: { it: "Comoda", en: "Comfy" }, sku: "S-1" },
  created_at: 1700000000, updated_at: 1700000100,
}

function routeApi(settings: LocaleSettings) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/schema") return { data: [SEED] }
    if (url === "/settings") return { data: settings }
    if (url === `/content/loc_posts/${ENTRY_ID}`) return { data: ENTRY }
    throw new Error(`unexpected request: ${url}`)
  })
}

function renderEditor(entryId?: string): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(EntryEditorDialog, {
        schemaSlug: "loc_posts",
        entryId,
        isDraftContext: false,
        open: true,
        onClose: vi.fn(),
      }),
    ),
  )
}

function payloadOf(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return mock.mock.calls[0][1] as Record<string, unknown>
}

describe("EntryEditorDialog — content localization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeApi(BILINGUAL)
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never)
    vi.mocked(api.post).mockResolvedValue({ data: { id: ENTRY_ID } } as never)
  })

  it("switching to EN shows each localized field's EN value and leaves non-localized fields unchanged", async () => {
    renderEditor(ENTRY_ID)
    const titleInput = await screen.findByLabelText(/^Title/)
    await waitFor(() => expect(titleInput).toHaveValue("Scarpa"))

    fireEvent.click(screen.getByRole("option", { name: /^EN/ }))

    expect(screen.getByLabelText(/^Title/)).toHaveValue("")
    expect(screen.getByLabelText(/^Summary/)).toHaveValue("Comfy")
    expect(screen.getByLabelText(/^SKU/)).toHaveValue("S-1")
  })

  it("saving after typing only the EN title sends { title: { en } } and omits untouched localized fields", async () => {
    renderEditor(ENTRY_ID)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))
    fireEvent.click(screen.getByRole("option", { name: /^EN/ }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Shoe" } })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    // Regression guard for carried-in (a): a top-level null, or a resend of every field, would
    // overwrite translations the editor never touched.
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0][0]).toBe(`/content/loc_posts/${ENTRY_ID}`)
    const payload = payloadOf(vi.mocked(api.put))
    expect(payload.title).toEqual({ en: "Shoe" })
    expect(payload.sku).toBe("S-1")
    expect(payload).not.toHaveProperty("summary")
  })

  it("clearing the EN summary sends null for EN only", async () => {
    renderEditor(ENTRY_ID)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))
    fireEvent.click(screen.getByRole("option", { name: /^EN/ }))
    fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "" } })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const payload = payloadOf(vi.mocked(api.put))
    expect(payload.summary).toEqual({ en: null })
    expect(payload).not.toHaveProperty("title")
  })

  it("a missing EN value offers Copy from default, which fills it with the IT value", async () => {
    renderEditor(ENTRY_ID)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))
    fireEvent.click(screen.getByRole("option", { name: /^EN/ }))

    fireEvent.click(screen.getByRole("button", { name: /Copy from default \(IT\)/ }))

    expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa")
  })

  it("the locale switcher counts filled localized fields per language", async () => {
    renderEditor(ENTRY_ID)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))

    expect(screen.getByRole("option", { name: /^IT/ })).toHaveTextContent(/2\/2 translated/)
    expect(screen.getByRole("option", { name: /^EN/ })).toHaveTextContent(/1\/2 translated/)
  })

  it("with one content language the editor shows no locale switcher", async () => {
    routeApi({ locales: ["it"], defaultLocale: "it", defaultLanguage: "it" })
    renderEditor(ENTRY_ID)

    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("creating an entry sends only the touched default-locale title and derives the slug from it", async () => {
    renderEditor(undefined)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue(""))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Scarpa Rossa" } })

    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    // Regression guard: the auto-slug used to receive a dictionary object and produce "".
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe("/content/loc_posts")
    const payload = payloadOf(vi.mocked(api.post))
    expect(payload.title).toEqual({ it: "Scarpa Rossa" })
    expect(payload.slug).toBe("scarpa-rossa")
    expect(payload).not.toHaveProperty("summary")
  })
})
