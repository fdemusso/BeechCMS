// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RelativeTime } from "@/components/ui/relative-time"

describe("RelativeTime", () => {
  it("renders em dash when value is null", () => {
    render(<RelativeTime value={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders em dash when value is undefined", () => {
    render(<RelativeTime value={undefined} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders a relative time string for a past timestamp", () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    render(<RelativeTime value={oneHourAgo} />)
    // Intl.RelativeTimeFormat with numeric:'auto' should produce something like "1 hour ago"
    const el = screen.getByText(/hour/i)
    expect(el).toBeInTheDocument()
  })

  it("renders a relative time string for a recent past", () => {
    const thirtySecondsAgo = Date.now() - 30 * 1000
    render(<RelativeTime value={thirtySecondsAgo} />)
    const el = screen.getByText(/second/i)
    expect(el).toBeInTheDocument()
  })

  it("applies className to the time span", () => {
    const now = Date.now() - 5000
    const { container } = render(<RelativeTime value={now} className="custom-class" />)
    const span = container.querySelector(".custom-class")
    expect(span).toBeInTheDocument()
  })
})
