// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { emptyViewConfig } from "@beechcms/core"
import type { ContentToolbarProps } from "@/features/content-toolbar"
import { TooltipProvider } from "@/components/ui/tooltip"

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
  useLocation: () => ({ pathname: "/content/posts", search: "" }),
}))

vi.mock("@/features/automations", () => ({
  AutomationPanel: () => null,
  useAutomations: () => ({ data: [], isLoading: false }),
}))

const seedPosts = {
  slug: "posts",
  label: "Post",
  labelPlural: "Post",
  dashboard: { views: ["table", "gallery"] },
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

vi.mock("@/features/content-management/hooks/use-content-list", () => ({
  useContentList: (...args: any[]) => ({
    data: mockFetchContentListServer(...args),
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/features/content-management/hooks/use-content-facets", () => ({
  useContentFacets: (...args: any[]) => ({
    data: mockFetchFacets(...args),
    isLoading: false,
    error: null,
  }),
  useDeleteContent: () => ({
    mutateAsync: async (...args: any[]) => mockDeleteContent(...args),
  }),
}))

vi.mock("@/features/content-management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/content-management")>()
  return {
    ...actual,
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
    useBulkUpdate: () => ({
      mutateAsync: async () => ({ updated: 0, failed: [] }),
      isPending: false,
    }),
    contentApi: {
      delete: (...args: any[]) => mockDeleteContent(...args),
    },
  }
})

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
  ContextMenu: ({ children }: any) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
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
  defaultHiddenColumns: () => ["id", "slug", "created_at"],
}))

vi.mock("@/features/content-toolbar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/content-toolbar")>()
  return {
    ...actual,
    ContentToolbar: (props: ContentToolbarProps) => (
      <div>
        <div data-testid="active-view">{props.activeViewId}</div>
        <button
          onClick={() =>
            props.onChangeView?.(props.views.find((v: { type: string }) => v.type === "gallery")?.id ?? "")
          }
        >
          change-view
        </button>
        <button onClick={() => props.onCreateView?.("gallery")}>create-view</button>
        <button onClick={() => props.onReorderViews?.([GALLERY_VIEW_ID, TABLE_VIEW_ID])}>reorder-views</button>
        <button onClick={() => props.onDeleteView?.(props.activeViewId)}>delete-view</button>
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
  }
})

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

const TABLE_VIEW_ID = "3f0b6a52-5c1e-4c8e-9a51-2f7f1c9b8d10"
const GALLERY_VIEW_ID = "8a6d2c41-0e7b-4f3a-b1c2-6d9e8f7a5b43"
const mockViews = [
  { id: TABLE_VIEW_ID, seedSlug: "posts", type: "table", title: null, position: 0, config: emptyViewConfig(), createdAt: 1, updatedAt: 1, updatedBy: "u" },
  { id: GALLERY_VIEW_ID, seedSlug: "posts", type: "gallery", title: null, position: 1, config: emptyViewConfig(), createdAt: 1, updatedAt: 1, updatedBy: "u" },
]
const mockCreateView = vi.fn()
const mockUpdateView = vi.fn()
const mockReorderView = vi.fn()
const mockDeleteView = vi.fn((_viewId: string, options?: { onSuccess?: () => void }) => {
  options?.onSuccess?.()
})

vi.mock("@/features/content-views/hooks/use-content-views", () => ({
  CONTENT_VIEWS_QUERY_KEY: (slug: string) => ["content-views", slug],
  useContentViews: () => ({ data: mockViews, isLoading: false, isError: false }),
  useCreateContentView: () => ({ mutate: mockCreateView }),
  useUpdateContentView: () => ({ mutate: mockUpdateView, isPending: false }),
  useDeleteContentView: () => ({ mutate: mockDeleteView }),
  useReorderContentViews: () => ({ mutate: mockReorderView }),
}))

import { ContentListPage } from "@/pages/content-list"

vi.mock("@/features/shared/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true, canAnywhere: () => true, canGlobally: () => true, effective: {} }) }))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

const renderWithProviders = (ui: ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  )
}

describe("ContentListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
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

  it("salva la vista scelta in localStorage, per seed, quando l'utente la cambia", async () => {
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(screen.getByText("change-view"))

    expect(screen.getByTestId("active-view")).toHaveTextContent(GALLERY_VIEW_ID)
    expect(localStorage.getItem("beech_content_view_posts")).toBe(GALLERY_VIEW_ID)
  })

  it("al mount usa la vista salvata in localStorage per quel seed, se presente", async () => {
    localStorage.setItem("beech_content_view_posts", GALLERY_VIEW_ID)
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    expect(screen.getByTestId("active-view")).toHaveTextContent(GALLERY_VIEW_ID)
  })

  it("falls back to the first Table instance when the stored view no longer exists", async () => {
    localStorage.setItem("beech_content_view_posts", "gallery")
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    expect(screen.getByTestId("active-view")).toHaveTextContent(TABLE_VIEW_ID)
  })

  it("creates a view of the picked type through the views API", async () => {
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(screen.getByText("create-view"))

    expect(mockCreateView).toHaveBeenCalledWith({ type: "gallery" }, expect.anything())
  })

  it("persists a new tab order through the views API", async () => {
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(screen.getByText("reorder-views"))

    expect(mockReorderView).toHaveBeenCalledWith([GALLERY_VIEW_ID, TABLE_VIEW_ID])
  })

  it("switching to the Gallery instance unmounts the table renderer and mounts the gallery renderer", async () => {
    mockFetchContentListServer.mockReturnValue({ items: [], total: 0 })
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(screen.getByText("DATA_TABLE")).toBeInTheDocument())

    fireEvent.click(screen.getByText("change-view"))

    await waitFor(() => expect(screen.queryByText("DATA_TABLE")).not.toBeInTheDocument())
    expect(screen.getByText("No items to display")).toBeInTheDocument()
  })

  async function reachGalleryEmptyState() {
    localStorage.setItem("beech_content_view_posts", GALLERY_VIEW_ID)
    renderWithProviders(<ContentListPage />)
    await waitFor(() => expect(mockFetchContentListServer).toHaveBeenCalled())

    fireEvent.click(screen.getByText("delete-view"))
    fireEvent.click(await screen.findByText("Confirm"))
    await waitFor(() => expect(screen.queryByTestId("active-view")).not.toBeInTheDocument())
  }

  it("shows the create-your-first-view state after the last Gallery view is deleted", async () => {
    await reachGalleryEmptyState()

    expect(screen.getByText(/views yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId("active-view")).not.toBeInTheDocument()
  })

  it("leaves the empty state when the user picks a view in the switcher", async () => {
    await reachGalleryEmptyState()

    fireEvent.click(screen.getByRole("tab", { name: /table/i }))

    expect(screen.getByTestId("active-view")).toHaveTextContent(TABLE_VIEW_ID)
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
