import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

const mockNavigate = vi.fn()
const mockUseParams = vi.fn()
const mockFetchContentListServer = vi.fn()
const mockDeleteContent = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

const seedPosts = {
  slug: "posts",
  label: "Post",
  labelPlural: "Post",
  branches: [
    { id: "b1", alias: "title", label: "Title", type: "text" },
    { id: "b2", alias: "createdAt", label: "Date", type: "date" },
    { id: "b3", alias: "tags", label: "Tags", type: "json", options: ["cms"] },
  ],
}

vi.mock("@/features/schema", () => ({
  useActiveSeed: (slug: string) => ({
    seed: slug === "posts" ? seedPosts : null,
    isLoading: false,
  })
}))

vi.mock("@/features/content-management", () => ({
  useContentList: (...args: any[]) => ({
    data: mockFetchContentListServer(...args),
    isLoading: false,
    error: null,
  }),
  useContentFacets: (...args: any[]) => ({
    data: mockFetchFacets(...args),
    isLoading: false,
    error: null,
  }),
  useDeleteContent: () => ({
    mutateAsync: async (...args: any[]) => mockDeleteContent(...args),
  }),
  contentApi: {
    delete: (...args: any[]) => mockDeleteContent(...args),
  }
}))

// Mock for facets return value
const mockFetchFacets = vi.fn()

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

vi.mock("@/features/navigation", () => ({
  AppSidebar: () => <div>APP_SIDEBAR</div>,
  SiteHeader: () => <div>SITE_HEADER</div>,
}))

vi.mock("@/lib/dynamic-columns", () => ({
  DEFAULT_DATE_GROUP_PRECISION: { year: true, month: true, day: false },
  computeMaxLengths: () => ({}),
  generateColumns: () => [],
}))

vi.mock("@/features/content-toolbar", () => ({
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

vi.mock("@/features/content-delete-dialog", () => ({
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

const renderWithProviders = (ui: ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe("ContentListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockUseParams.mockReturnValue({ slug: "posts" })
    mockFetchFacets.mockReturnValue({ statuses: ["draft"], tagsByColumnId: { tags: ["cms"] } })
    mockFetchContentListServer.mockReturnValue({
      items: [{ id: "id-1", slug: "hello", status: "draft", data: { title: "Hello" } }],
      total: 1,
    })
  })

  it("mostra errore se seed non esiste", () => {
    mockUseParams.mockReturnValue({ slug: "missing" })
    renderWithProviders(<ContentListPage />)
    expect(screen.getByText("Error")).toBeInTheDocument()
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("carica dati e rifà fetch quando cambiano search/sort/filter", async () => {
    renderWithProviders(<ContentListPage />)

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
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())
    fireEvent.click(screen.getByText("create-entry"))
    expect(mockNavigate).toHaveBeenCalledWith("/content/posts/create")
  })

  it("apre dialog ed esegue delete con refresh dati", async () => {
    mockDeleteContent.mockResolvedValueOnce(undefined)
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(await screen.findByText("Delete"))
    fireEvent.click(await screen.findByText("confirm-delete"))

    await waitFor(() => expect(mockDeleteContent).toHaveBeenCalledWith({ slug: "posts", id: "id-1" }))
    await waitFor(() => expect(mockFetchContentListServer.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
