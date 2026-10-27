// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { ImageLightbox } from "./image-lightbox"

describe("ImageLightbox", () => {
  it("renders the image when open and nothing when closed", () => {
    const { rerender } = render(<ImageLightbox open={false} onOpenChange={vi.fn()} src="/a.png" alt="A cat" />)
    expect(screen.queryByAltText("A cat")).toBeNull()

    rerender(<ImageLightbox open onOpenChange={vi.fn()} src="/a.png" alt="A cat" />)
    expect(screen.getByAltText("A cat").getAttribute("src")).toBe("/a.png")
  })

  it("closes when the image is clicked", () => {
    const onOpenChange = vi.fn()
    render(<ImageLightbox open onOpenChange={onOpenChange} src="/a.png" alt="A cat" />)

    fireEvent.click(screen.getByAltText("A cat"))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("closes on Escape", () => {
    const onOpenChange = vi.fn()
    render(<ImageLightbox open onOpenChange={onOpenChange} src="/a.png" alt="A cat" />)

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
