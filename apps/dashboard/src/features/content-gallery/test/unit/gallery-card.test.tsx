// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { GalleryCard } from "@/features/content-gallery/gallery-components/gallery-card"
import type { GalleryCardDisplayModel } from "@/features/content-gallery/gallery-card-display"
import { getConditionalFormatCardClass } from "@/lib/conditional-format"

function makeModel(overrides: Partial<GalleryCardDisplayModel> = {}): GalleryCardDisplayModel {
  return {
    entryId: "entry-1",
    status: "published",
    tags: [],
    category: "",
    imageUrl: null,
    title: "Published entry",
    excerpt: "",
    dateText: "",
    ariaLabel: "Open detail: Published entry",
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
    expect(screen.getByText("Pending draft")).toBeInTheDocument()
  })

  it("puts the tone's card border class on the card button when elementStyle is set", () => {
    render(
      <GalleryCard
        model={makeModel({ elementStyle: { tone: "warning", textStyles: [] } })}
        onOpen={vi.fn()}
      />
    )

    const button = screen.getByRole("button")
    for (const cls of getConditionalFormatCardClass("warning", []).split(" ")) {
      expect(button.className).toContain(cls)
    }
  })

  it("puts the tone's cell text class on the title heading, and not on the excerpt", () => {
    render(
      <GalleryCard
        model={makeModel({
          excerpt: "Some excerpt",
          slotStyles: { title: { tone: "danger", textStyles: [] } },
        })}
        onOpen={vi.fn()}
      />
    )

    const heading = screen.getByRole("heading", { name: "Published entry" })
    const excerpt = screen.getByText("Some excerpt")
    expect(heading.className).toContain("text-destructive")
    expect(excerpt.className).not.toContain("text-destructive")
  })
})
