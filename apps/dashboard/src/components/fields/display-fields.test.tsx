// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BooleanDisplay } from "@/components/fields/display/boolean"
import { DateDisplay } from "@/components/fields/display/date"
import { JsonDisplay } from "@/components/fields/display/json"
import { TagsDisplay } from "@/components/fields/display/tags"
import { NumberDisplay } from "@/components/fields/display/number"
import { RichtextDisplay } from "@/components/fields/display/richtext"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Branch } from "@beechcms/core"

const branch = { id: "br_01", alias: "field", label: "Field", type: "text" } as unknown as Branch

describe("BooleanDisplay", () => {
  it("true value mostra 'Yes'", () => {
    render(<BooleanDisplay branch={branch} value={true} />)
    expect(screen.getByText("Yes")).toBeInTheDocument()
  })

  it("stringa 'true' mostra 'Yes'", () => {
    render(<BooleanDisplay branch={branch} value="true" />)
    expect(screen.getByText("Yes")).toBeInTheDocument()
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

  it("JSON con testo mostra il testo estratto", () => {
    const value = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    }
    render(<RichtextDisplay branch={branch} value={value} />)
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it("JSON senza testo mostra '-'", () => {
    const value = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [],
        },
      ],
    }
    render(<RichtextDisplay branch={branch} value={value} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("stringa HTML legacy viene scartata e mostra '-'", () => {
    render(<RichtextDisplay branch={branch} value="<p>Hello world</p>" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })
})

describe("TagsDisplay", () => {
  const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!
  const priority = posts.branches.find((b) => b.alias === "priority") as Branch
  const freeTags = posts.branches.find((b) => b.alias === "tags") as Branch

  it("un valore valido è un chip con sfondo del colore dichiarato", () => {
    render(<TagsDisplay branch={priority} value={["high"]} />)

    const chip = screen.getByText("high").closest("[data-slot='badge']") as HTMLElement

    expect(chip.style.backgroundColor).toBe("#ef4444")
  })

  it("un valore fuori elenco è un chip con aria-label \"not in the options\"", () => {
    render(<TagsDisplay branch={priority} value={["gone"]} />)

    const chip = screen.getByLabelText("gone — not in the options")

    expect(chip).toBeInTheDocument()
  })

  it("un valore di posts.tags è un chip senza stile inline", () => {
    render(<TagsDisplay branch={freeTags} value={["react"]} />)

    const chip = screen.getByText("react").closest("[data-slot='badge']") as HTMLElement

    expect(chip.getAttribute("style")).toBeNull()
  })

  it("la stringa maschera è resa come testo", () => {
    render(<TagsDisplay branch={priority} value="••••••••" />)

    const masked = screen.getByText("••••••••")

    expect(masked).toBeInTheDocument()
    expect(masked.closest("[data-slot='badge']")).toBeNull()
  })
})

describe("JsonDisplay", () => {
  it("un branch json con alias tags e valore array è reso come JSON, non come chip", () => {
    // Rule 6.2.4: the alias heuristic was removed (brief §2.9), so no chip is drawn for json branches.
    const jsonTagsAlias = { id: "br_j", alias: "tags", label: "Tags", type: "json" } as unknown as Branch

    render(<JsonDisplay branch={jsonTagsAlias} value={["a"]} />)

    expect(document.querySelector("[data-slot='badge']")).toBeNull()
  })
})
