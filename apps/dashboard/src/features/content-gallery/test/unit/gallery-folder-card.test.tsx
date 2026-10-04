// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import i18n from "i18next"

import { GalleryFolderCard } from "@/features/content-gallery/gallery-components/gallery-folder-card"
import { formatItemCount } from "@/features/content-gallery/gallery-components/format-item-count"
import type { GalleryCategoryGroup } from "@/features/content-gallery/group-by-category"
import type { GalleryCardDisplayModel } from "@/features/content-gallery/gallery-card-display"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Test env lingua di default "en" (src/test/setup.ts): le assertion sotto
// usano le stringhe inglesi, prese dalla stessa istanza i18next reale usata
// dal componente (nessuna duplicazione a mano della logica di pluralizzazione).
const t = i18n.t.bind(i18n)

function makeModel(imageUrl: string | null): GalleryCardDisplayModel {
  return {
    entryId: imageUrl ?? "no-image",
    status: "published",
    tags: [],
    category: "Wedding",
    imageUrl,
    title: "Photo",
    excerpt: "",
    dateText: "",
    ariaLabel: "Open detail: Photo",
    statusVariant: "default",
    hasPendingDraft: false,
  }
}

function makeGroup(overrides: Partial<GalleryCategoryGroup> = {}): GalleryCategoryGroup {
  return {
    key: "wedding",
    label: "Wedding",
    models: [makeModel("a.jpg"), makeModel("b.jpg")],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatItemCount
// ---------------------------------------------------------------------------

describe("formatItemCount", () => {
  it("usa il singolare per una sola foto", () => {
    expect(formatItemCount(t, 1)).toBe("1 photo")
  })

  it("usa il plurale per zero o più foto", () => {
    expect(formatItemCount(t, 0)).toBe("0 photos")
    expect(formatItemCount(t, 2)).toBe("2 photos")
  })
})

// ---------------------------------------------------------------------------
// GalleryFolderCard
// ---------------------------------------------------------------------------

describe("GalleryFolderCard", () => {
  it("mostra l'etichetta del gruppo e il conteggio foto", () => {
    render(<GalleryFolderCard group={makeGroup()} onOpen={vi.fn()} />)
    expect(screen.getByText("Wedding")).toBeInTheDocument()
    expect(screen.getByText("2 photos")).toBeInTheDocument()
  })

  it("usa l'etichetta 'senza categoria' quando il gruppo non ne ha una propria", () => {
    render(<GalleryFolderCard group={makeGroup({ key: null, label: null })} onOpen={vi.fn()} />)
    expect(screen.getByText("Other photos")).toBeInTheDocument()
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

    const button = screen.getByRole("button", { name: "Open folder Wedding, 2 photos" })
    button.click()

    expect(onOpen).toHaveBeenCalledWith("wedding")
  })
})
