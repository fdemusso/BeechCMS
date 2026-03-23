import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

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
    { id: "t1", alias: "title", label: "Titolo", type: "text" },
    { id: "r1", alias: "content", label: "Contenuto", type: "richtext" },
    { id: "j1", alias: "metaData", label: "Metadati", type: "json" },
  ],
}

vi.mock("@beech/core", () => ({
  getSeed: () => seedPosts,
}))

vi.mock("@/lib/content-api", () => ({
  fetchContentById: (...args: unknown[]) => mockFetchContentById(...args),
  createContent: (...args: unknown[]) => mockCreateContent(...args),
  updateContent: (...args: unknown[]) => mockUpdateContent(...args),
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
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

import { EntryEditorPage } from "@/pages/entry-editor"

describe("EntryEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ slug: "posts" })
  })

  it("in create mode auto-genera slug dal primo campo testo e salva", async () => {
    mockCreateContent.mockResolvedValueOnce({})
    render(<EntryEditorPage />)

    const titleInput = await screen.findByLabelText("field-title")
    fireEvent.change(titleInput, { target: { value: "Ciao Mondo!" } })

    const slugInput = screen.getByLabelText(/slug/i)
    await waitFor(() => expect((slugInput as HTMLInputElement).value).toBe("ciao-mondo"))

    fireEvent.click(screen.getByRole("button", { name: "Salva" }))

    await waitFor(() => expect(mockCreateContent).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith("Entry creata")
    expect(mockNavigate).toHaveBeenCalledWith("/content/posts")
  })

  it("blocca submit e mostra errore se json non valido", async () => {
    render(<EntryEditorPage />)
    const metaInput = await screen.findByLabelText("field-metaData")
    fireEvent.change(metaInput, { target: { value: "{bad json}" } })

    fireEvent.click(screen.getByRole("button", { name: "Salva" }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
      expect(mockCreateContent).not.toHaveBeenCalled()
    })
  })

  it("in edit mode carica entry e usa updateContent", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "42" })
    mockFetchContentById.mockResolvedValueOnce({
      id: "42",
      slug: "entry-42",
      status: "draft",
      data: { title: "Old", content: "<p>x</p>", metaData: "{\"a\":1}" },
    })
    mockUpdateContent.mockResolvedValueOnce({})

    render(<EntryEditorPage />)
    await waitFor(() => expect(mockFetchContentById).toHaveBeenCalledWith("posts", "42"))
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(mockUpdateContent).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith("Modifiche salvate")
  })
})
