import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const mockNavigate = vi.fn()
const mockUseParams = vi.fn()
const mockBlockerState = { state: "unblocked", reset: vi.fn(), proceed: vi.fn() }
const mockFetchContentById = vi.fn()
const mockCreateContent = vi.fn()
const mockUpdateContent = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
  useBlocker: () => mockBlockerState,
}))

const seedPosts = {
  slug: "posts",
  label: "Post",
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
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => <div>APP_SIDEBAR</div> }))
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <div>SITE_HEADER</div> }))

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
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
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
})
