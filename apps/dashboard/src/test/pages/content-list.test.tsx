import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

const mockNavigate = vi.fn()
const mockUseParams = vi.fn()
const mockFetchContentListServer = vi.fn()
const mockFetchContentFacets = vi.fn()
const mockDeleteContent = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}))

const seedPosts = {
  slug: "posts",
  label: "Post",
  labelPlural: "Post",
  branches: [
    { id: "b1", alias: "title", label: "Titolo", type: "text" },
    { id: "b2", alias: "createdAt", label: "Data", type: "date" },
    { id: "b3", alias: "tags", label: "Tag", type: "json", options: ["cms"] },
  ],
}

vi.mock("@beech/core", () => ({
  getSeed: (slug: string) => (slug === "posts" ? seedPosts : null),
}))

vi.mock("@/lib/content-api", () => ({
  fetchContentListServer: (...args: unknown[]) => mockFetchContentListServer(...args),
  fetchContentFacets: (...args: unknown[]) => mockFetchContentFacets(...args),
  deleteContent: (...args: unknown[]) => mockDeleteContent(...args),
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
vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuItem: ({ children, onSelect }: any) => <button onClick={onSelect}>{children}</button>,
  ContextMenuLabel: ({ children }: any) => <div>{children}</div>,
  ContextMenuSeparator: () => <div />,
}))

vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => <div>APP_SIDEBAR</div> }))
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <div>SITE_HEADER</div> }))

vi.mock("@/lib/dynamic-columns", () => ({
  DEFAULT_DATE_GROUP_PRECISION: { year: true, month: true, day: false },
  computeMaxLengths: () => ({}),
  generateColumns: () => [],
}))

vi.mock("@/components/content-toolbar", () => ({
  ContentToolbar: (props: any) => (
    <div>
      <button onClick={props.onCreate}>create-entry</button>
      <button onClick={() => props.onSearchChange?.("ciao")}>search</button>
      <button onClick={() => props.onSortChange?.({ columnId: "title", desc: false })}>
        sort
      </button>
      <button
        onClick={() =>
          props.onFiltersChange?.({
            title: {
              columnId: "title",
              label: "Titolo",
              type: "text",
              conditions: [{ id: "c1", op: "contains", value: "hello" }],
            },
          })
        }
      >
        filter
      </button>
      {props.children}
    </div>
  ),
}))

vi.mock("@/components/content-delete-dialog", () => ({
  ContentDeleteDialog: (props: any) =>
    props.open ? <button onClick={props.onConfirm}>confirm-delete</button> : null,
}))

vi.mock("@/components/ui/data-table", () => ({
  DataTable: (props: any) => {
    const menu = props.renderRowContextMenuContent?.({
      id: "id-1",
      data: {},
      status: "draft",
      slug: "a",
    })
    return (
      <div>
        <div>DATA_TABLE</div>
        {menu}
      </div>
    )
  },
}))

import { ContentListPage } from "@/pages/content-list"

describe("ContentListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ slug: "posts" })
    mockFetchContentFacets.mockResolvedValue({ statuses: ["draft"], tagsByColumnId: { tags: ["cms"] } })
    mockFetchContentListServer.mockResolvedValue({
      items: [{ id: "id-1", slug: "hello", status: "draft", data: { title: "Hello" } }],
      total: 1,
    })
  })

  it("mostra errore se seed non esiste", () => {
    mockUseParams.mockReturnValue({ slug: "missing" })
    render(<ContentListPage />)
    expect(screen.getByText("Errore")).toBeInTheDocument()
    expect(screen.getByText(/non trovato/i)).toBeInTheDocument()
  })

  it("carica dati e rifà fetch quando cambiano search/sort/filter", async () => {
    render(<ContentListPage />)

    await waitFor(() => {
      expect(mockFetchContentListServer).toHaveBeenCalled()
      expect(screen.getByText("DATA_TABLE")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("search"))
    fireEvent.click(screen.getByText("sort"))
    fireEvent.click(screen.getByText("filter"))

    await waitFor(() => {
      expect(mockFetchContentListServer.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it("naviga alla create page dalla toolbar", async () => {
    render(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())
    fireEvent.click(screen.getByText("create-entry"))
    expect(mockNavigate).toHaveBeenCalledWith("/content/posts/create")
  })

  it("apre dialog ed esegue delete con refresh dati", async () => {
    mockDeleteContent.mockResolvedValueOnce(undefined)
    render(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(await screen.findByText("Elimina"))
    fireEvent.click(await screen.findByText("confirm-delete"))

    await waitFor(() => expect(mockDeleteContent).toHaveBeenCalledWith("posts", "id-1"))
    await waitFor(() => expect(mockFetchContentListServer.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
