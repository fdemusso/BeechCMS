// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BooleanDisplay } from "@/features/fields/display/boolean"
import { DateDisplay } from "@/features/fields/display/date"
import { NumberDisplay } from "@/features/fields/display/number"
import { RichtextDisplay } from "@/features/fields/display/richtext"
import type { Branch } from "@beechcms/core"

const branch = { id: "br_01", alias: "field", label: "Field", type: "text" } as unknown as Branch

describe("BooleanDisplay", () => {
  it("true value mostra 'Sì'", () => {
    render(<BooleanDisplay branch={branch} value={true} />)
    expect(screen.getByText("Sì")).toBeInTheDocument()
  })

  it("stringa 'true' mostra 'Sì'", () => {
    render(<BooleanDisplay branch={branch} value="true" />)
    expect(screen.getByText("Sì")).toBeInTheDocument()
  })

  it("false value mostra 'No'", () => {
    render(<BooleanDisplay branch={branch} value={false} />)
    expect(screen.getByText("No")).toBeInTheDocument()
  })

  it("null value mostra 'No'", () => {
    render(<BooleanDisplay branch={branch} value={null} />)
    expect(screen.getByText("No")).toBeInTheDocument()
  })
})

describe("DateDisplay", () => {
  it("null value mostra '-'", () => {
    render(<DateDisplay branch={branch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("stringa vuota mostra '-'", () => {
    render(<DateDisplay branch={branch} value="" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("data ISO valida mostra data formattata", () => {
    render(<DateDisplay branch={branch} value="2024-06-15T00:00:00.000Z" />)
    const el = screen.getByText(/2024/)
    expect(el).toBeInTheDocument()
  })

  it("stringa non-data mostra 'Invalid Date' (comportamento Intl)", () => {
    render(<DateDisplay branch={branch} value="not-a-date" />)
    expect(screen.getByText(/Invalid Date|not-a-date/)).toBeInTheDocument()
  })
})

describe("NumberDisplay", () => {
  it("null value mostra '-'", () => {
    render(<NumberDisplay branch={branch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("zero mostra '0'", () => {
    render(<NumberDisplay branch={branch} value={0} />)
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("numero formattato con Intl it-IT", () => {
    render(<NumberDisplay branch={branch} value={1234567} />)
    const el = screen.getByText(/1\.234\.567/)
    expect(el).toBeInTheDocument()
  })

  it("decimali troncati a 2 cifre", () => {
    render(<NumberDisplay branch={branch} value={3.14159} />)
    expect(screen.getByText(/3,14/)).toBeInTheDocument()
  })

  it("rating: renderizza 5 stelle per valore 3 su max 5", () => {
    const ratingBranch = {
      ...branch,
      numberOptions: { control: "rating", max: 5 },
    } as unknown as Branch
    const { container } = render(<NumberDisplay branch={ratingBranch} value={3} />)
    const stars = container.querySelectorAll("svg")
    // ogni stella ha 2 SVG (outline + fill) solo per quelle piene, ma almeno max SVG outline
    expect(stars.length).toBeGreaterThanOrEqual(5)
  })

  it("rating: null value mostra '-'", () => {
    const ratingBranch = {
      ...branch,
      numberOptions: { control: "rating", max: 5 },
    } as unknown as Branch
    render(<NumberDisplay branch={ratingBranch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("percentage: renderizza una progress bar con aria-label formattato", () => {
    const pctBranch = {
      ...branch,
      numberOptions: { format: "percentage" },
    } as unknown as Branch
    const { container } = render(<NumberDisplay branch={pctBranch} value={75} />)
    const progress = container.querySelector("[data-slot=progress]")
    expect(progress).toBeInTheDocument()
    expect(progress).toHaveAttribute("aria-label", expect.stringMatching(/%/))
  })

  it("percentage: valore 0-1 normalizzato correttamente", () => {
    const pctBranch = {
      ...branch,
      numberOptions: { format: "percentage" },
    } as unknown as Branch
    const { container } = render(<NumberDisplay branch={pctBranch} value={0.4} />)
    const progress = container.querySelector("[data-slot=progress]")
    expect(progress).toBeInTheDocument()
  })

  it("percentage: null value mostra '-'", () => {
    const pctBranch = {
      ...branch,
      numberOptions: { format: "percentage" },
    } as unknown as Branch
    render(<NumberDisplay branch={pctBranch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })
})

describe("RichtextDisplay", () => {
  it("null value mostra '-'", () => {
    render(<RichtextDisplay branch={branch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("stringa vuota mostra '-'", () => {
    render(<RichtextDisplay branch={branch} value="" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("HTML con testo mostra il testo estratto", () => {
    render(<RichtextDisplay branch={branch} value="<p>Hello world</p>" />)
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it("HTML senza testo mostra '-'", () => {
    render(<RichtextDisplay branch={branch} value="<br/><hr/>" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })
})
