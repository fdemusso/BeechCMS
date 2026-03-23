import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RichtextEdit } from "@/components/fields/edit/richtext"

const mockBranch = {
  id: "br_01",
  alias: "body",
  label: "Corpo",
  type: "richtext" as const,
}

describe("RichtextEdit", () => {
  it("render con value iniziale -> editor visibile, contenuto corrispondente", () => {
    render(
      <RichtextEdit
        branch={mockBranch}
        value="<p>Hello world</p>"
        onChange={() => {}}
      />
    )
    const editor = document.querySelector(".ProseMirror")
    expect(editor).toBeInTheDocument()
    expect(editor?.textContent).toContain("Hello world")
  })

  it("toolbar presente -> pulsanti Bold, Italic, H2, List visibili", () => {
    render(
      <RichtextEdit branch={mockBranch} value="" onChange={() => {}} />
    )
    expect(screen.getByRole("button", { name: /Grassetto/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Corsivo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Heading 2/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Elenco puntato/i })).toBeInTheDocument()
  })
})

