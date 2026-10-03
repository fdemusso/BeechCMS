// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ReactNode } from "react"
import type { Branch, Seed } from "@beechcms/core"
import type { ContentEntry } from "@/lib/dynamic-columns"

// ---------------------------------------------------------------------------
// Mocks (must be declared before the import of the component under test)
// ---------------------------------------------------------------------------

vi.mock("@/features/content-gallery/gallery-hooks", () => ({
  useContentGallery: (mockSeed: Seed, data: ContentEntry[], groupBy: string | null) => {
    const cardModels = data.map((entry) => ({
      entryId: entry.id,
      status: entry.status ?? "draft",
      tags: [],
      category: String(entry.data?.["categoria"] ?? ""),
      imageUrl: null,
      title: entry.data?.["title"] ?? "",
      excerpt: "",
      dateText: "",
      ariaLabel: `Apri dettaglio: ${entry.data?.["title"] ?? entry.id}`,
      statusVariant: "outline",
    }))
    // Raggruppamento minimale: la logica reale è coperta da group-by-category.test.ts.
    // categoryAlias riflette lo stesso "Raggruppa per" passato dal chiamante (groupBy),
    // non viene più indovinato dalla forma del seed.
    const categoryAlias = groupBy && mockSeed.branches.some((b) => b.alias === groupBy) ? groupBy : null
    const labels = [...new Set(cardModels.map((m) => m.category).filter(Boolean))]
    const categoryGroups = categoryAlias
      ? labels.map((label) => ({
          key: label.toLowerCase(),
          label,
          models: cardModels.filter((m) => m.category === label),
        }))
      : []
    return { setPeekId: vi.fn(), peekEntry: null, cardModels, categoryGroups, categoryAlias }
  },
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

vi.mock("@/components/ui/small-cta", () => ({
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

const seedWithCategory: Seed = {
  ...seed,
  branches: [makeBranch("title"), makeBranch("categoria")],
} as Seed

function renderGallery(ui: ReactNode, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

function makeEntry(id: string, title = `Entry ${id}`, categoria?: string): ContentEntry {
  return { id, slug: id, data: { title, ...(categoria ? { categoria } : {}) }, status: "draft" } as unknown as ContentEntry
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContentGallery", () => {
  it("mostra lo skeleton durante il caricamento", () => {
    renderGallery(<ContentGallery seed={seed} data={[]} isLoading onEdit={vi.fn()} groupBy={null} />)
    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument()
  })

  it("mostra il messaggio vuoto quando data è un array vuoto", () => {
    renderGallery(<ContentGallery seed={seed} data={[]} isLoading={false} onEdit={vi.fn()} groupBy={null} />)
    expect(screen.getByText(/No items to display/i)).toBeInTheDocument()
  })

  it("renderizza una card per ogni entry", () => {
    const data = [makeEntry("e1", "Articolo uno"), makeEntry("e2", "Articolo due")]
    renderGallery(<ContentGallery seed={seed} data={data} isLoading={false} onEdit={vi.fn()} groupBy={null} />)

    expect(screen.getByTestId("card-e1")).toBeInTheDocument()
    expect(screen.getByTestId("card-e2")).toBeInTheDocument()
    expect(screen.getByText("Articolo uno")).toBeInTheDocument()
    expect(screen.getByText("Articolo due")).toBeInTheDocument()
  })

  it("non mostra lo skeleton quando isLoading è false e ci sono dati", () => {
    const data = [makeEntry("e1")]
    renderGallery(<ContentGallery seed={seed} data={data} isLoading={false} onEdit={vi.fn()} groupBy={null} />)
    expect(screen.queryByTestId("skeleton-grid")).not.toBeInTheDocument()
  })

  const categorized = [
    makeEntry("1", "A", "Matrimonio"),
    makeEntry("2", "B", "Battesimo"),
    makeEntry("3", "C", "Matrimonio"),
  ]

  it("con categorie mostra prima le cartelle, senza le card", () => {
    renderGallery(<ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" />)
    expect(screen.getByRole("button", { name: "Open folder Matrimonio, 2 photos" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open folder Battesimo, 1 photo" })).toBeInTheDocument()
    expect(screen.queryByTestId("card-1")).not.toBeInTheDocument()
  })

  it("aprendo una cartella mostra solo le sue card, e 'Back to folders' riporta alle cartelle", () => {
    renderGallery(<ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" />)

    fireEvent.click(screen.getByRole("button", { name: /Open folder Matrimonio/ }))
    const section = screen.getByRole("region", { name: "Matrimonio" })
    expect(section.querySelectorAll("[data-testid^='card-']")).toHaveLength(2)
    expect(screen.queryByTestId("card-2")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back to folders" }))
    expect(screen.queryByRole("region", { name: "Matrimonio" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open folder Battesimo/ })).toBeInTheDocument()
  })

  it("apre direttamente la cartella indicata nell'URL (parametro album)", () => {
    renderGallery(
      <ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" />,
      "/?album=battesimo"
    )
    expect(screen.getByRole("region", { name: "Battesimo" })).toBeInTheDocument()
    expect(screen.getByTestId("card-2")).toBeInTheDocument()
  })

  it("torna alle cartelle se la cartella nell'URL non esiste", () => {
    renderGallery(
      <ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" />,
      "/?album=inesistente"
    )
    expect(screen.getByRole("button", { name: /Open folder Matrimonio/ })).toBeInTheDocument()
  })

  it("con il campo categoria ma senza foto mostra l'invito a creare la prima cartella", () => {
    renderGallery(<ContentGallery seed={seedWithCategory} data={[]} onEdit={vi.fn()} groupBy="categoria" onCreate={vi.fn()} />)
    expect(screen.getByText("You don't have any folders yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New folder" })).toBeInTheDocument()
  })

  it("'Add photo here' apre la creazione con la categoria precompilata", () => {
    const onCreate = vi.fn()
    renderGallery(<ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole("button", { name: /Open folder Matrimonio/ }))
    fireEvent.click(screen.getByRole("button", { name: "Add photo here" }))
    expect(onCreate).toHaveBeenCalledWith({ categoria: "Matrimonio" })
  })

  it("'New folder' chiede il nome e apre la creazione con la categoria precompilata", () => {
    const onCreate = vi.fn()
    renderGallery(<ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole("button", { name: "New folder" }))
    const confirm = screen.getByRole("button", { name: "Create and add photo" })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "  Comunione " } })
    fireEvent.click(confirm)
    expect(onCreate).toHaveBeenCalledWith({ categoria: "Comunione" })
  })

  it("'New folder' con un nome già esistente apre quella cartella invece di duplicarla", () => {
    const onCreate = vi.fn()
    renderGallery(<ContentGallery seed={seedWithCategory} data={categorized} onEdit={vi.fn()} groupBy="categoria" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole("button", { name: "New folder" }))
    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "matrimonio" } })
    fireEvent.click(screen.getByRole("button", { name: "Create and add photo" }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("region", { name: "Matrimonio" })).toBeInTheDocument()
  })

  it("senza campo categoria mostra la griglia piatta, senza cartelle", () => {
    renderGallery(<ContentGallery seed={seed} data={[makeEntry("1"), makeEntry("2")]} onEdit={vi.fn()} groupBy={null} onCreate={vi.fn()} />)
    expect(screen.queryAllByRole("region")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument()
    expect(screen.getByTestId("card-1")).toBeInTheDocument()
  })
})
