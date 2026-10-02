// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import {
  GalleryFolderCard,
  UNCATEGORIZED_LABEL,
  formatItemCount,
} from "@/features/content-gallery/gallery-components/gallery-folder-card"
import type { GalleryCategoryGroup } from "@/features/content-gallery/group-by-category"
import type { GalleryCardDisplayModel } from "@/features/content-gallery/gallery-card-display"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(imageUrl: string | null): GalleryCardDisplayModel {
  return {
    entryId: imageUrl ?? "no-image",
    status: "published",
    tags: [],
    category: "Matrimonio",
    imageUrl,
    title: "Foto",
    excerpt: "",
    dateText: "",
    ariaLabel: "Apri dettaglio: Foto",
    statusVariant: "default",
    hasPendingDraft: false,
  }
}

function makeGroup(overrides: Partial<GalleryCategoryGroup> = {}): GalleryCategoryGroup {
  return {
    key: "matrimonio",
    label: "Matrimonio",
    models: [makeModel("a.jpg"), makeModel("b.jpg")],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatItemCount
// ---------------------------------------------------------------------------

describe("formatItemCount", () => {
  it("usa il singolare per una sola foto", () => {
    expect(formatItemCount(1)).toBe("1 foto")
  })

  it("usa il plurale per zero o più foto", () => {
    expect(formatItemCount(0)).toBe("0 foto")
    expect(formatItemCount(2)).toBe("2 foto")
  })
})

// ---------------------------------------------------------------------------
// GalleryFolderCard
// ---------------------------------------------------------------------------

describe("GalleryFolderCard", () => {
  it("mostra l'etichetta del gruppo e il conteggio foto", () => {
    render(<GalleryFolderCard group={makeGroup()} onOpen={vi.fn()} />)
    expect(screen.getByText("Matrimonio")).toBeInTheDocument()
    expect(screen.getByText("2 foto")).toBeInTheDocument()
  })

  it("usa UNCATEGORIZED_LABEL quando il gruppo non ha un'etichetta", () => {
    render(<GalleryFolderCard group={makeGroup({ key: null, label: null })} onOpen={vi.fn()} />)
    expect(screen.getByText(UNCATEGORIZED_LABEL)).toBeInTheDocument()
  })

  it("mostra al massimo 3 anteprime, ignorando le entry senza immagine", () => {
    const group = makeGroup({
      models: [
        makeModel("a.jpg"),
        makeModel(null),
        makeModel("b.jpg"),
        makeModel("c.jpg"),
        makeModel("d.jpg"),
      ],
    })
    render(<GalleryFolderCard group={group} onOpen={vi.fn()} />)
    // alt="" → le anteprime sono immagini decorative, ruolo ARIA "presentation" non "img".
    expect(screen.getAllByRole("presentation")).toHaveLength(3)
  })

  it("senza anteprime disponibili mostra l'icona cartella al posto delle immagini", () => {
    const group = makeGroup({ models: [makeModel(null), makeModel(null)] })
    render(<GalleryFolderCard group={group} onOpen={vi.fn()} />)
    expect(screen.queryAllByRole("presentation")).toHaveLength(0)
  })

  it("il bottone ha l'aria-label con etichetta e conteggio, e chiama onOpen con la chiave del gruppo al click", () => {
    const onOpen = vi.fn()
    render(<GalleryFolderCard group={makeGroup()} onOpen={onOpen} />)

    const button = screen.getByRole("button", { name: "Apri cartella Matrimonio, 2 foto" })
    button.click()

    expect(onOpen).toHaveBeenCalledWith("matrimonio")
  })
})
