// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const {
  mockNavigate,
  mockUseParams,
  mockBlockerState,
  getMockLocationState,
  setMockLocationState,
  mockLocationListeners,
} = vi.hoisted(() => {
  let state: any = null
  const listeners = new Set<() => void>()
  return {
    mockNavigate: vi.fn((_to, options) => {
      if (options?.state) {
        state = options.state
        listeners.forEach((l) => l())
      }
    }),
    mockUseParams: vi.fn(),
    mockBlockerState: { state: "unblocked", reset: vi.fn(), proceed: vi.fn() },
    getMockLocationState: () => state,
    setMockLocationState: (s: any) => {
      state = s
      listeners.forEach((l) => l())
    },
    mockLocationListeners: listeners,
  }
})

const mockFetchContentById = vi.fn()
const mockCreateContent = vi.fn()
const mockUpdateContent = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockFetchDraft = vi.fn()
const mockSaveDraft = vi.fn()
const mockPublishDraft = vi.fn()
const mockDiscardDraft = vi.fn()

vi.mock("react-router-dom", async () => {
  const { useState, useEffect } = await import("react")
  return {
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
    useBlocker: () => mockBlockerState,
    useLocation: () => {
      const [, setState] = useState(getMockLocationState())
      useEffect(() => {
        const handler = () => setState(getMockLocationState())
        mockLocationListeners.add(handler)
        return () => {
          mockLocationListeners.delete(handler)
        }
      }, [])
    },
  }
})

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "admin" },
    status: "authenticated",
  }),
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}))

const seedPosts = {
  slug: "posts",
  label: "Post",
  allowDrafts: true,
  branches: [
    { id: "t1", alias: "title", label: "Title", type: "text" },
    { id: "r1", alias: "content", label: "Content", type: "richtext" },
    { id: "j1", alias: "metaData", label: "Metadata", type: "json" },
  ],
  layout: {
    tabs: [
      {
        id: "tab-data",
        label: "Data",
        sections: [
          {
            id: "sec-general",
            label: "General",
            columns: [
              {
                id: "col-general",
                fields: [
                  { branchId: "t1" },
                  { branchId: "r1" },
                  { branchId: "j1" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

vi.mock("@beechcms/core", async () => {
  const actual = await vi.importActual<typeof import("@beechcms/core")>("@beechcms/core")
  return {
    ...actual,
    getSeed: () => seedPosts,
    slugify: (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, ""),
  }
})

vi.mock("@/features/shared", () => ({
  useActiveSeed: (slug: string) => ({
    seed: slug === "posts" ? seedPosts : null,
    isLoading: false,
  })
}))

vi.mock("@/features/content-management", () => ({
  contentApi: {
    fetchById: (...args: unknown[]) => mockFetchContentById(...args),
    create: (...args: unknown[]) => mockCreateContent(...args),
    update: (...args: unknown[]) => mockUpdateContent(...args),
  },
  useContentEntry: (slug: string, id: string) => ({
    data: id ? mockFetchContentById(slug, id) : undefined,
    isLoading: false,
    error: null,
  }),
  useSaveContent: () => ({
    mutateAsync: async ({ slug, id, data }: any) => {
      if (id) return mockUpdateContent(slug, id, data)
      return mockCreateContent(slug, data)
    },
    isPending: false,
  }),
  useDraftEntry: (slug: string, id: string) => ({
    data: id ? mockFetchDraft(slug, id) : undefined,
    isLoading: false,
  }),
  useSaveDraft: () => ({
    mutateAsync: mockSaveDraft,
    isPending: false,
  }),
  usePublishDraft: () => ({
    mutateAsync: mockPublishDraft,
    isPending: false,
  }),
  useDiscardDraft: () => ({
    mutateAsync: mockDiscardDraft,
    isPending: false,
  }),
  useDeleteContent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

vi.mock("@/features/backrefs", () => ({
  ReferencedByPanel: () => null,
}))

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/features/navigation", () => ({
  AppSidebar: () => <div>APP_SIDEBAR</div>,
  SiteHeader: () => <div>SITE_HEADER</div>,
}))

vi.mock("@/components/fields", () => ({
  FieldEdit: ({ branch, value, onChange }: any) => (
    <input
      aria-label={`field-${branch.alias}`}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <button data-value={value}>{children}</button>,
}))

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) => open === false ? null : <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div role="alertdialog">{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

// Mock di i18next potenziato per coprire i bottoni e le etichette
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "common.create": "Create",
        "common.delete": "Delete",
        "content.editor.save": "Save",
        "content.editor.saving": "Saving...",
        "content.editor.back": "Back",
        "content.editor.newEntry": `New entry ${params?.label}`,
        "content.editor.editEntry": `Edit entry ${params?.label}`,
        "content.editor.createdSuccess": "Entry created",
        "content.editor.savedSuccess": "Changes saved",
        "content.editor.metadataSeo": "Metadata / SEO",
        "content.editor.content": "Content",
        "content.editor.status": "Status",
        "content.editor.slug": "Slug",
        "content.editor.draft": "Draft",
        "content.editor.published": "Published",
        "content.editor.pendingDraftNotice": "This entry has a pending draft.",
        "content.editor.draftModeNotice": "Editing pending draft — changes will not go live until published.",
        "content.editor.editDraft": "Resume draft",
        "content.editor.resumeDraft": "Resume draft",
        "content.editor.saveDraft": "Save draft",
        "content.editor.publishDraft": "Publish draft",
        "content.editor.discardDraft": "Discard draft",
        "content.editor.discardDraftTitle": "Discard pending draft",
        "content.editor.discardDraftDesc": "This will permanently delete the pending draft.",
        "content.editor.draftPublishSuccess": "Draft published successfully",
        "content.editor.draftSaveSuccess": "Draft saved",
        "content.editor.draftDiscardSuccess": "Pending draft discarded",
      }
      return translations[key] || key
    },
  }),
}))

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { EntryEditorDialog } from "@/features/entry-editor"
import {
  prepareSubmissionPayload,
  validateEntryJsonFields,
  getInitialStatus,
} from "@/features/entry-editor/hooks/use-entry-editor-dialog"

function TestEntryEditorDialogWrapper({ schemaSlug, entryId, open = true, onClose, defaultValues }: any) {
  const [mockState, setMockState] = useState(getMockLocationState())
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => setMockState(getMockLocationState())
    mockLocationListeners.add(handler)
    return () => {
      mockLocationListeners.delete(handler)
    }
  }, [])

  const defaultOnClose = () => {
    navigate(`/content/${schemaSlug}`)
  }

  const isDraftContext = !!mockState?.isDraftContext
  const effectiveDefaults = defaultValues ?? mockState?.defaultValues
  return (
    <EntryEditorDialog
      schemaSlug={schemaSlug}
      entryId={entryId}
      isDraftContext={isDraftContext}
      open={open}
      onClose={onClose || defaultOnClose}
      defaultValues={effectiveDefaults}
    />
  )
}

describe("EntryEditorPage", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ slug: "posts" })
    setMockLocationState(null)
  })

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  it("in create mode auto-genera slug dal primo campo testo e salva", async () => {
    mockCreateContent.mockResolvedValueOnce({ id: "new-id" })
    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId={undefined} />)

    const titleInput = await screen.findByLabelText("field-title")
    fireEvent.change(titleInput, { target: { value: "Ciao Mondo!" } })

    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(mockCreateContent).toHaveBeenCalledWith(
      "posts",
      expect.objectContaining({ slug: "ciao-mondo" })
    ))
    expect(mockToastSuccess).toHaveBeenCalledWith("Entry created")
    expect(mockNavigate).toHaveBeenCalledWith("/content/posts")
  })

  it("blocca submit e mostra errore se json non valido", async () => {
    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId={undefined} />)
    const metaInput = await screen.findByLabelText("field-metaData")
    fireEvent.change(metaInput, { target: { value: "{bad json}" } })

    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
      expect(mockCreateContent).not.toHaveBeenCalled()
    })
  })

  it("in edit mode carica entry e usa updateContent", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "42" })
    mockFetchContentById.mockReturnValue({
      id: "42",
      slug: "entry-42",
      status: "draft",
      data: {
        title: "Old",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        metaData: "{\"a\":1}",
      },
    })
    mockUpdateContent.mockResolvedValueOnce({ success: true })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="42" />)
    await waitFor(() => expect(mockFetchContentById).toHaveBeenCalledWith("posts", "42"))
    
    const saveButton = await screen.findByRole("button", { name: "Save" })
    fireEvent.click(saveButton)
    
    await waitFor(() => expect(mockUpdateContent).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith("Changes saved")
  })

  it("mostra un avviso esplicito quando l'entry ha una bozza in sospeso", async () => {
    mockFetchDraft.mockReturnValue(undefined)
    mockUseParams.mockReturnValue({ slug: "posts", id: "42" })
    mockFetchContentById.mockReturnValue({
      id: "42",
      slug: "entry-42",
      status: "published",
      has_pending_draft: true,
      data: {
        title: "Published",
        content: { type: "doc", content: [{ type: "paragraph" }] },
        metaData: "{}",
      },
    })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="42" />)

    expect(await screen.findByText("This entry has a pending draft.")).toBeInTheDocument()
  })

  it("in create mode with isDraftContext and defaultValues saves with status draft, displays draft notice and redirects to /drafts", async () => {
    setMockLocationState({
      isDraftContext: true,
      defaultValues: { status: "draft" },
    })
    mockCreateContent.mockResolvedValueOnce({ id: "new-draft-id" })

    renderWithProvider(
      <TestEntryEditorDialogWrapper
        schemaSlug="posts"
        entryId={undefined}
      />
    )

    expect(await screen.findByText("Editing pending draft — changes will not go live until published.")).toBeInTheDocument()

    const saveDraftBtn = screen.getByRole("button", { name: "Save draft" })
    expect(saveDraftBtn).toBeInTheDocument()

    const titleInput = await screen.findByLabelText("field-title")
    fireEvent.change(titleInput, { target: { value: "Bozza Articolo" } })

    fireEvent.click(saveDraftBtn)

    await waitFor(() => {
      expect(mockCreateContent).toHaveBeenCalledWith(
        "posts",
        expect.objectContaining({
          slug: "bozza-articolo",
          status: "draft",
        })
      )
      expect(mockToastSuccess).toHaveBeenCalledWith("Entry created")
      expect(mockNavigate).toHaveBeenCalledWith("/drafts")
    })
  })

  it("handles reserved/builtin prototype keys like constructor and toString safely without prototype pollution or false ACKs", () => {
    const branches = [
      { id: "b1", alias: "title", label: "Title", type: "text" },
      { id: "b2", alias: "metaData", label: "Metadata", type: "json" },
    ]

    // Form data with prototype keys
    const maliciousFormData = Object.create({
      title: "Inherited Title",
      metaData: "{\"inherited\": true}",
    }) as Record<string, unknown>
    maliciousFormData["constructor"] = () => {}
    maliciousFormData["toString"] = "malicious string"

    // validateEntryJsonFields should check Object.hasOwn and not crash/false-ACK
    const validationResult = validateEntryJsonFields(branches, maliciousFormData)
    expect(validationResult.isValid).toBe(true)

    // prepareSubmissionPayload should not use inherited properties
    const payload = prepareSubmissionPayload({
      branches,
      formData: maliciousFormData,
      slug: "proto-test",
      status: "draft",
    })
    expect(payload.title).toBeUndefined()
    expect(payload.metaData).toBeUndefined()
    expect(payload.slug).toBe("proto-test")
    expect(payload.status).toBe("draft")

    // getInitialStatus should safely check Object.hasOwn on defaultValues
    const protoDefaults = Object.create({ status: "published" })
    expect(getInitialStatus(protoDefaults, true)).toBe("draft")
    expect(getInitialStatus(protoDefaults, false)).toBe("published")
  })
})

describe("DraftActionBanner", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  beforeEach(() => {
    vi.clearAllMocks()
    setMockLocationState(null)
  })

  const renderWithProvider = (ui: React.ReactElement) =>
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

  const entryWithDraft = {
    id: "entry-1",
    status: "published",
    slug: "my-post",
    has_pending_draft: true,
    data: { title: "Live title" },
  }

  it("renders Resume draft and Discard draft when has_pending_draft is true", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="entry-1" />)

    await waitFor(() => {
      expect(screen.getByText(/resume draft/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument()
    })
  })

  it("loads draft data into form when Resume draft is clicked", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="entry-1" />)

    await waitFor(() => screen.getByText(/resume draft/i))
    fireEvent.click(screen.getByRole("button", { name: /resume draft/i }))

    await waitFor(() => {
      expect(screen.getByText(/editing pending draft/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument()
    })
  })

  it("calls publishDraft and navigates on Publish draft click", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })
    mockPublishDraft.mockResolvedValue({ success: true })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="entry-1" />)

    await waitFor(() => screen.getByText(/resume draft/i))
    fireEvent.click(screen.getByRole("button", { name: /resume draft/i }))
    await waitFor(() => screen.getByText(/publish draft/i))
    fireEvent.click(screen.getByRole("button", { name: /publish draft/i }))

    await waitFor(() => {
      expect(mockPublishDraft).toHaveBeenCalledWith({ slug: "posts", id: "entry-1" })
      expect(mockNavigate).toHaveBeenCalledWith("/drafts")
    })
  })

  it("shows confirmation dialog before discarding", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="entry-1" />)

    await waitFor(() => screen.getByRole("button", { name: /discard draft/i }))
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }))

    await waitFor(() => {
      expect(screen.getByText(/discard pending draft/i)).toBeInTheDocument()
    })
  })

  it("calls discardDraft and resets to live mode on confirm", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })
    mockDiscardDraft.mockResolvedValue({ success: true })

    renderWithProvider(<TestEntryEditorDialogWrapper schemaSlug="posts" entryId="entry-1" />)

    await waitFor(() => screen.getByRole("button", { name: /discard draft/i }))
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }))
    await waitFor(() => screen.getByText(/discard pending draft/i))

    const alertdialog = screen.getByRole("alertdialog", { hidden: true })
    const confirmBtn = within(alertdialog).getByRole("button", { name: /discard draft/i, hidden: true })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockDiscardDraft).toHaveBeenCalledWith({ slug: "posts", id: "entry-1" })
    })
  })
})
