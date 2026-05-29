// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
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
    mockNavigate: vi.fn((to, options) => {
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
      const [state, setState] = useState(getMockLocationState())
      useEffect(() => {
        const handler = () => setState(getMockLocationState())
        mockLocationListeners.add(handler)
        return () => {
          mockLocationListeners.delete(handler)
        }
      }, [])
      return { state }
    },
  }
})

const seedPosts = {
  slug: "posts",
  label: "Post",
  allowDrafts: true,
  branches: [
    { id: "t1", alias: "title", label: "Title", type: "text" },
    { id: "r1", alias: "content", label: "Content", type: "richtext" },
    { id: "j1", alias: "metaData", label: "Metadata", type: "json" },
  ],
}

vi.mock("@beechcms/core", () => ({
  getSeed: () => seedPosts,
  slugify: (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
}))

vi.mock("@/features/schema", () => ({
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

vi.mock("@/features/fields", () => ({
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
  AlertDialog: ({ children, open }: any) => open !== false ? <div>{children}</div> : null,
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

import { EntryEditorPage } from "@/pages/entry-editor"

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
    renderWithProvider(<EntryEditorPage />)

    const titleInput = await screen.findByLabelText("field-title")
    fireEvent.change(titleInput, { target: { value: "Ciao Mondo!" } })

    const slugInput = screen.getByLabelText(/slug/i)
    await waitFor(() => expect((slugInput as HTMLInputElement).value).toBe("ciao-mondo"))

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mockCreateContent).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith("Entry created")
    expect(mockNavigate).toHaveBeenCalledWith("/content/posts")
  })

  it("blocca submit e mostra errore se json non valido", async () => {
    renderWithProvider(<EntryEditorPage />)
    const metaInput = await screen.findByLabelText("field-metaData")
    fireEvent.change(metaInput, { target: { value: "{bad json}" } })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

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

    renderWithProvider(<EntryEditorPage />)
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

    renderWithProvider(<EntryEditorPage />)

    expect(await screen.findByText("This entry has a pending draft.")).toBeInTheDocument()
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

    renderWithProvider(<EntryEditorPage />)

    await waitFor(() => {
      expect(screen.getByText(/resume draft/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument()
    })
  })

  it("loads draft data into form when Resume draft is clicked", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockReturnValue(entryWithDraft)
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    renderWithProvider(<EntryEditorPage />)

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

    renderWithProvider(<EntryEditorPage />)

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

    renderWithProvider(<EntryEditorPage />)

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

    renderWithProvider(<EntryEditorPage />)

    await waitFor(() => screen.getByRole("button", { name: /discard draft/i }))
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }))
    await waitFor(() => screen.getByText(/discard pending draft/i))

    const confirmBtn = screen.getAllByRole("button", { name: /discard draft/i })
      .find(btn => btn.closest('[role="alertdialog"]'))
    fireEvent.click(confirmBtn!)

    await waitFor(() => {
      expect(mockDiscardDraft).toHaveBeenCalledWith({ slug: "posts", id: "entry-1" })
    })
  })
})
