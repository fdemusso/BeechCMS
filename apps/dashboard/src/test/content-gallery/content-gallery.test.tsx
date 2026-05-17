import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { Branch, Seed } from "@beechcms/core"
import type { ContentEntry } from "@/lib/dynamic-columns"

// ---------------------------------------------------------------------------
// Mocks (must be declared before the import of the component under test)
// ---------------------------------------------------------------------------

vi.mock("@/features/content-gallery/gallery-hooks", () => ({
  useContentGallery: (_seed: Seed, data: ContentEntry[]) => ({
    setPeekId: vi.fn(),
    peekEntry: null,
    cardModels: data.map((entry) => ({
      entryId: entry.id,
      status: entry.status ?? "draft",
      tags: [],
      imageUrl: null,
      title: entry.data?.["title"] ?? "",
      excerpt: "",
      dateText: "",
      ariaLabel: `Apri dettaglio: ${entry.data?.["title"] ?? entry.id}`,
      statusVariant: "outline",
    })),
  }),
}))

vi.mock("@/features/content-gallery/gallery-components/gallery-card", () => ({
  GalleryCard: ({ model }: any) => <div data-testid={`card-${model.entryId}`}>{model.title}</div>,
}))

vi.mock("@/features/content-gallery/gallery-components/gallery-peek-panel", () => ({
  GalleryPeekPanel: () => null,
}))

vi.mock("@/features/content-gallery/gallery-components/gallery-skeleton-grid", () => ({
  GallerySkeletonGrid: () => <div data-testid="skeleton-grid" />,
}))

vi.mock("@/components/ui/empty", () => ({
  Empty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyMedia: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { ContentGallery } from "@/features/content-gallery/content-gallery"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBranch(alias: string, type = "text"): Branch {
  return { alias, type, label: alias } as Branch
}

const seed: Seed = {
  slug: "articles",
  label: "Article",
  labelPlural: "Articles",
  branches: [makeBranch("title")],
} as Seed

function makeEntry(id: string, title = `Entry ${id}`): ContentEntry {
  return { id, slug: id, data: { title }, status: "draft" } as unknown as ContentEntry
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContentGallery", () => {
  it("mostra lo skeleton durante il caricamento", () => {
    render(<ContentGallery seed={seed} data={[]} isLoading onEdit={vi.fn()} />)
    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument()
  })

  it("mostra il messaggio vuoto quando data è un array vuoto", () => {
    render(<ContentGallery seed={seed} data={[]} isLoading={false} onEdit={vi.fn()} />)
    expect(screen.getByText(/Nessun elemento/i)).toBeInTheDocument()
  })

  it("renderizza una card per ogni entry", () => {
    const data = [makeEntry("e1", "Articolo uno"), makeEntry("e2", "Articolo due")]
    render(<ContentGallery seed={seed} data={data} isLoading={false} onEdit={vi.fn()} />)

    expect(screen.getByTestId("card-e1")).toBeInTheDocument()
    expect(screen.getByTestId("card-e2")).toBeInTheDocument()
    expect(screen.getByText("Articolo uno")).toBeInTheDocument()
    expect(screen.getByText("Articolo due")).toBeInTheDocument()
  })

  it("non mostra lo skeleton quando isLoading è false e ci sono dati", () => {
    const data = [makeEntry("e1")]
    render(<ContentGallery seed={seed} data={data} isLoading={false} onEdit={vi.fn()} />)
    expect(screen.queryByTestId("skeleton-grid")).not.toBeInTheDocument()
  })
})
