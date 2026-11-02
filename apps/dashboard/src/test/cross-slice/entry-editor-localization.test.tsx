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
const mocked = vi.hoisted(() => ({ settings: vi.fn(), schema: vi.fn(), entryGet: vi.fn(), entryPut: vi.fn(), entryPost: vi.fn() }))
vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      settings: { $get: mocked.settings },
      schema: { $get: mocked.schema },
      content: { ":slug": { $post: mocked.entryPost, ":id": { $get: mocked.entryGet, $put: mocked.entryPut } } },
    },
  },
}))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, status: "authenticated" }) }))
vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, canGlobally: () => true, effective: {} }),
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
    SelectItem: ({ value, className, children, ...rest }: { value: string; className?: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext)
      return (
        <button
          type="button"
          role="option"
          aria-selected={false}
          className={className}
          onClick={() => onValueChange(value)}
          {...rest}
        >
          {children}
        </button>
      )
    },
  }
})

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
  id: ENTRY_ID, slug: "scarpa", status: "published", has_pending_draft: false,
  data: { title: { it: "Scarpa" }, summary: { it: "Comoda", en: "Comfy" }, sku: "S-1" },
  created_at: 1700000000, updated_at: 1700000100,
}

function routeApi(settings: LocaleSettings) {
  mocked.entryGet.mockImplementation(async ({ param }: { param: { slug: string; id: string } }) => {
    if (param.slug === "loc_posts" && param.id === ENTRY_ID) return { json: async () => ENTRY }
    throw new Error(`unexpected request: ${param.slug}/${param.id}`)
  })
  mocked.schema.mockResolvedValue({ json: async () => [SEED] })
  mocked.settings.mockResolvedValue({ json: async () => settings })
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
  return (mock.mock.calls[0][0] as { json: Record<string, unknown> }).json
}

describe("EntryEditorDialog — content localization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeApi(BILINGUAL)
    mocked.entryPut.mockResolvedValue({ json: async () => ({ success: true }) })
    mocked.entryPost.mockResolvedValue({ json: async () => ({ id: ENTRY_ID }) })
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
    await waitFor(() => expect(mocked.entryPut).toHaveBeenCalledTimes(1))
    expect(mocked.entryPut.mock.calls[0][0].param).toEqual({ slug: "loc_posts", id: ENTRY_ID })
    const payload = payloadOf(mocked.entryPut)
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

    await waitFor(() => expect(mocked.entryPut).toHaveBeenCalledTimes(1))
    const payload = payloadOf(mocked.entryPut)
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

  it("the locale switcher styles locales according to translation status without counters", async () => {
    routeApi({ locales: ["it", "en", "es"], defaultLocale: "it", defaultLanguage: "it" })
    renderEditor(ENTRY_ID)
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue("Scarpa"))

    const itOption = screen.getByRole("option", { name: /^IT/ })
    const enOption = screen.getByRole("option", { name: /^EN/ })
    const esOption = screen.getByRole("option", { name: /^ES/ })

    // No counters
    expect(itOption).not.toHaveTextContent(/translated/)
    expect(enOption).not.toHaveTextContent(/translated/)
    expect(esOption).not.toHaveTextContent(/translated/)

    // IT is fully translated (2/2) -> normal styling
    expect(itOption).toHaveAttribute("data-status", "translated")
    expect(itOption.className).not.toMatch(/text-destructive|text-amber/)

    // EN is partially translated (1/2) -> amber styling
    expect(enOption).toHaveAttribute("data-status", "partial")
    expect(enOption.className).toMatch(/text-amber/)

    // ES is untranslated (0/2) -> red / destructive styling
    expect(esOption).toHaveAttribute("data-status", "untranslated")
    expect(esOption.className).toMatch(/text-destructive/)
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
    await waitFor(() => expect(mocked.entryPost).toHaveBeenCalledTimes(1))
    expect(mocked.entryPost.mock.calls[0][0].param).toEqual({ slug: "loc_posts" })
    const payload = payloadOf(mocked.entryPost)
    expect(payload.title).toEqual({ it: "Scarpa Rossa" })
    expect(payload.slug).toBe("scarpa-rossa")
    expect(payload).not.toHaveProperty("summary")
  })
})
