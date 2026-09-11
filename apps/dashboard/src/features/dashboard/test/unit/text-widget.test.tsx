// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TextWidget } from "@/features/dashboard/components/widgets/text-widget"

describe("TextWidget", () => {
  it("renders plain text content with line breaks preserved", () => {
    render(<TextWidget config={{ content: "Line one\nLine two" }} />)
    const node = screen.getByText((_, element) =>
      element?.textContent === "Line one\nLine two" && element.classList.contains("whitespace-pre-wrap"),
    )
    expect(node).toHaveClass("whitespace-pre-wrap")
  })

  it("does not render HTML markup contained in the content", () => {
    render(<TextWidget config={{ content: "<strong>bold</strong>" }} />)
    expect(screen.queryByRole("strong")).not.toBeInTheDocument()
    expect(screen.getByText("<strong>bold</strong>")).toBeInTheDocument()
  })

  it("centers text when align is 'center'", () => {
    render(<TextWidget config={{ content: "centered", align: "center" }} />)
    expect(screen.getByText("centered")).toHaveClass("text-center")
  })
})
