// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { GalleryCard } from "@/features/content-gallery/gallery-components/gallery-card"
import type { GalleryCardDisplayModel } from "@/features/content-gallery/gallery-card-display"

function makeModel(overrides: Partial<GalleryCardDisplayModel> = {}): GalleryCardDisplayModel {
  return {
    entryId: "entry-1",
    status: "published",
    tags: [],
    imageUrl: null,
    title: "Published entry",
    excerpt: "",
    dateText: "",
    ariaLabel: "Apri dettaglio: Published entry",
    statusVariant: "default",
    hasPendingDraft: false,
    ...overrides,
  }
}

describe("GalleryCard", () => {
  it("mostra il badge bozza in sospeso quando il modello lo richiede", () => {
    render(
      <GalleryCard
        model={makeModel({ hasPendingDraft: true })}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByText("published")).toBeInTheDocument()
    expect(screen.getByText("Bozza in sospeso")).toBeInTheDocument()
  })
})
